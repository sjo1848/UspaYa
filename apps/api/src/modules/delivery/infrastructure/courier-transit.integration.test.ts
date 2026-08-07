import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { NestFactory } from '@nestjs/core';
import { closePrismaClient, getPrismaClient } from '@uspaya/database';

import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const MERCHANT_OPERATOR_ID = '22222222-2222-4222-8222-222222222222';
const OPERATIONS_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const prisma = getPrismaClient();

interface TransitResponse {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly courierId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

interface ErrorResponse {
  readonly code: string;
  readonly correlationId: string;
}

test('courier transit preserves assignment, ordering and event evidence', async (context) => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevIdentity = process.env.DEV_IDENTITY_ENABLED;
  process.env.NODE_ENV = 'test';
  process.env.DEV_IDENTITY_ENABLED = 'true';

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApplication(app);
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  assert.ok(address !== null && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  context.after(async () => {
    await app.close();
    await closePrismaClient();
    restoreEnvironment('NODE_ENV', originalNodeEnv);
    restoreEnvironment('DEV_IDENTITY_ENABLED', originalDevIdentity);
  });

  await context.test('only a courier can start delivery transit', async () => {
    const fixture = await createPickedUpDelivery(baseUrl);
    const response = await startDelivery(baseUrl, fixture.deliveryId, CUSTOMER_ID, 4);

    assert.equal(response.status, 403);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'ROLE_FORBIDDEN');
  });

  await context.test('another courier cannot infer or advance the delivery', async () => {
    const fixture = await createPickedUpDelivery(baseUrl);
    const otherCourierId = await createCourier();

    const response = await startDelivery(baseUrl, fixture.deliveryId, otherCourierId, 4);
    assert.equal(response.status, 404);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'DELIVERY_NOT_FOUND');
  });

  await context.test('delivery cannot start before pickup is confirmed', async () => {
    const fixture = await createAssignedDelivery(baseUrl);

    const response = await startDelivery(baseUrl, fixture.deliveryId, fixture.courierId, 2);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'INVALID_STATE');

    const persisted = await prisma.delivery.findUniqueOrThrow({
      where: { id: fixture.deliveryId },
    });
    assert.equal(persisted.status, 'ASSIGNED');
    assert.equal(persisted.version, 2);
  });

  await context.test('stale version does not start delivery', async () => {
    const fixture = await createPickedUpDelivery(baseUrl);

    const response = await startDelivery(baseUrl, fixture.deliveryId, fixture.courierId, 3);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'VERSION_CONFLICT');

    const persisted = await prisma.delivery.findUniqueOrThrow({
      where: { id: fixture.deliveryId },
    });
    assert.equal(persisted.status, 'PICKED_UP');
    assert.equal(persisted.version, 4);
  });

  await context.test('arrival cannot be reported before delivery starts', async () => {
    const fixture = await createPickedUpDelivery(baseUrl);

    const response = await reportArrival(baseUrl, fixture.deliveryId, fixture.courierId, 4);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'INVALID_STATE');

    assert.equal(
      await prisma.auditLog.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: fixture.deliveryId,
          action: 'ReportCourierArrival',
        },
      }),
      0,
    );
  });

  await context.test(
    'start and arrival persist one event each and retries remain safe',
    async () => {
      const fixture = await createPickedUpDelivery(baseUrl);

      const started = await startDelivery(baseUrl, fixture.deliveryId, fixture.courierId, 4);
      assert.equal(started.status, 200);
      assert.deepEqual(await readJson<TransitResponse>(started), {
        deliveryId: fixture.deliveryId,
        orderId: fixture.orderId,
        courierId: fixture.courierId,
        status: 'ON_THE_WAY',
        version: 5,
        changed: true,
      });

      const repeatedStart = await startDelivery(baseUrl, fixture.deliveryId, fixture.courierId, 4);
      assert.equal(repeatedStart.status, 200);
      assert.deepEqual(await readJson<TransitResponse>(repeatedStart), {
        deliveryId: fixture.deliveryId,
        orderId: fixture.orderId,
        courierId: fixture.courierId,
        status: 'ON_THE_WAY',
        version: 5,
        changed: false,
      });

      const arrived = await reportArrival(baseUrl, fixture.deliveryId, fixture.courierId, 5);
      assert.equal(arrived.status, 200);
      assert.deepEqual(await readJson<TransitResponse>(arrived), {
        deliveryId: fixture.deliveryId,
        orderId: fixture.orderId,
        courierId: fixture.courierId,
        status: 'ARRIVED',
        version: 6,
        changed: true,
      });

      const repeatedArrival = await reportArrival(
        baseUrl,
        fixture.deliveryId,
        fixture.courierId,
        5,
      );
      assert.equal(repeatedArrival.status, 200);
      assert.deepEqual(await readJson<TransitResponse>(repeatedArrival), {
        deliveryId: fixture.deliveryId,
        orderId: fixture.orderId,
        courierId: fixture.courierId,
        status: 'ARRIVED',
        version: 6,
        changed: false,
      });

      assert.equal(
        await prisma.auditLog.count({
          where: {
            aggregateType: 'Delivery',
            aggregateId: fixture.deliveryId,
            action: 'StartDelivery',
          },
        }),
        1,
      );
      assert.equal(
        await prisma.auditLog.count({
          where: {
            aggregateType: 'Delivery',
            aggregateId: fixture.deliveryId,
            action: 'ReportCourierArrival',
          },
        }),
        1,
      );
      assert.equal(
        await prisma.outboxEvent.count({
          where: {
            aggregateType: 'Delivery',
            aggregateId: fixture.deliveryId,
            eventName: 'DeliveryStarted',
          },
        }),
        1,
      );
      assert.equal(
        await prisma.outboxEvent.count({
          where: {
            aggregateType: 'Delivery',
            aggregateId: fixture.deliveryId,
            eventName: 'CourierArrived',
          },
        }),
        1,
      );
      assert.equal(
        await prisma.courierAssignment.count({
          where: {
            deliveryId: fixture.deliveryId,
            courierId: fixture.courierId,
            active: true,
          },
        }),
        1,
      );
    },
  );
});

async function createPickedUpDelivery(baseUrl: string): Promise<{
  orderId: string;
  deliveryId: string;
  courierId: string;
}> {
  const fixture = await createAssignedDelivery(baseUrl);

  let response = await fetch(`${baseUrl}/courier/deliveries/${fixture.deliveryId}/start-pickup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': fixture.courierId,
    },
    body: JSON.stringify({ expectedVersion: 2 }),
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/courier/deliveries/${fixture.deliveryId}/confirm-pickup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': fixture.courierId,
    },
    body: JSON.stringify({
      expectedVersion: 3,
      merchantResponsible: 'Responsable comercio',
      packageCount: 1,
    }),
  });
  assert.equal(response.status, 200);

  return fixture;
}

async function createAssignedDelivery(baseUrl: string): Promise<{
  orderId: string;
  deliveryId: string;
  courierId: string;
}> {
  const order = await createReadyOrder(baseUrl);
  const courierId = await createCourier();
  const response = await fetch(`${baseUrl}/operations/deliveries/${order.deliveryId}/assign`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': OPERATIONS_ID,
    },
    body: JSON.stringify({
      courierId,
      expectedVersion: 1,
    }),
  });
  assert.equal(response.status, 200);
  return { ...order, courierId };
}

async function createReadyOrder(baseUrl: string): Promise<{ orderId: string; deliveryId: string }> {
  const order = await submitOrder(baseUrl);
  await assertOrderTransition(baseUrl, order.orderId, 'accept', 2);
  await assertOrderTransition(baseUrl, order.orderId, 'start-preparation', 3);
  await assertOrderTransition(baseUrl, order.orderId, 'ready', 4);
  return order;
}

async function submitOrder(baseUrl: string): Promise<{ orderId: string; deliveryId: string }> {
  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `courier-transit-${randomUUID()}`,
      'x-dev-actor-id': CUSTOMER_ID,
    },
    body: JSON.stringify({
      orderId,
      deliveryId,
      paymentId: randomUUID(),
      branchId: BRANCH_ID,
      deliveryPin: '4826',
      items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 1 }],
    }),
  });
  assert.equal(response.status, 201);
  return { orderId, deliveryId };
}

async function assertOrderTransition(
  baseUrl: string,
  orderId: string,
  action: 'accept' | 'start-preparation' | 'ready',
  expectedVersion: number,
): Promise<void> {
  const response = await fetch(`${baseUrl}/orders/${orderId}/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': MERCHANT_OPERATOR_ID,
    },
    body: JSON.stringify({ expectedVersion }),
  });
  assert.equal(response.status, 200);
}

function startDelivery(
  baseUrl: string,
  deliveryId: string,
  courierId: string,
  expectedVersion: number,
): Promise<Response> {
  return fetch(`${baseUrl}/courier/deliveries/${deliveryId}/start-delivery`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': courierId,
    },
    body: JSON.stringify({ expectedVersion }),
  });
}

function reportArrival(
  baseUrl: string,
  deliveryId: string,
  courierId: string,
  expectedVersion: number,
): Promise<Response> {
  return fetch(`${baseUrl}/courier/deliveries/${deliveryId}/arrive`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': courierId,
    },
    body: JSON.stringify({ expectedVersion }),
  });
}

async function createCourier(): Promise<string> {
  const courierId = randomUUID();
  await prisma.user.create({
    data: {
      id: courierId,
      email: `transit-courier-${courierId}@uspaya.test`,
      displayName: 'Synthetic transit courier',
      roleAssignments: {
        create: {
          id: randomUUID(),
          role: 'COURIER',
        },
      },
    },
  });
  return courierId;
}

async function readJson<T extends object>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
