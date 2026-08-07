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

interface PickupResponse {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly courierId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

interface ActiveDeliveryResponse {
  readonly delivery: {
    readonly id: string;
    readonly orderId: string;
    readonly status: string;
    readonly version: number;
    readonly orderStatus: string;
  };
}

interface ErrorResponse {
  readonly code: string;
  readonly correlationId: string;
}

test('courier pickup preserves assignment, readiness and custody evidence', async (context) => {
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

  await context.test('only a courier can use courier delivery endpoints', async () => {
    const response = await fetch(`${baseUrl}/courier/deliveries/active`, {
      headers: { 'x-dev-actor-id': CUSTOMER_ID },
    });
    assert.equal(response.status, 403);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'ROLE_FORBIDDEN');
  });

  await context.test('assigned courier can consult the active delivery without PIN material', async () => {
    const fixture = await createAssignedReadyDelivery(baseUrl);

    const response = await fetch(`${baseUrl}/courier/deliveries/active`, {
      headers: { 'x-dev-actor-id': fixture.courierId },
    });
    assert.equal(response.status, 200);

    const body = await readJson<ActiveDeliveryResponse>(response);
    assert.equal(body.delivery.id, fixture.deliveryId);
    assert.equal(body.delivery.orderId, fixture.orderId);
    assert.equal(body.delivery.status, 'ASSIGNED');
    assert.equal(body.delivery.version, 2);
    assert.equal(body.delivery.orderStatus, 'READY');
    assert.equal('pinHash' in body.delivery, false);
    assert.equal('pin' in body.delivery, false);
  });

  await context.test('another courier cannot infer or mutate the assigned delivery', async () => {
    const fixture = await createAssignedReadyDelivery(baseUrl);
    const otherCourierId = await createCourier();

    const activeResponse = await fetch(`${baseUrl}/courier/deliveries/active`, {
      headers: { 'x-dev-actor-id': otherCourierId },
    });
    assert.equal(activeResponse.status, 404);
    assert.equal((await readJson<ErrorResponse>(activeResponse)).code, 'DELIVERY_NOT_FOUND');

    const pickupResponse = await startPickup(
      baseUrl,
      fixture.deliveryId,
      otherCourierId,
      2,
    );
    assert.equal(pickupResponse.status, 404);
    assert.equal((await readJson<ErrorResponse>(pickupResponse)).code, 'DELIVERY_NOT_FOUND');
  });

  await context.test('pickup cannot start if the order is no longer READY', async () => {
    const fixture = await createAssignedReadyDelivery(baseUrl);
    await prisma.order.update({
      where: { id: fixture.orderId },
      data: { status: 'PREPARING' },
    });

    const response = await startPickup(baseUrl, fixture.deliveryId, fixture.courierId, 2);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'BUSINESS_RULE_VIOLATION');

    const persisted = await prisma.delivery.findUniqueOrThrow({
      where: { id: fixture.deliveryId },
    });
    assert.equal(persisted.status, 'ASSIGNED');
    assert.equal(persisted.version, 2);
  });

  await context.test('stale version does not start pickup', async () => {
    const fixture = await createAssignedReadyDelivery(baseUrl);

    const response = await startPickup(baseUrl, fixture.deliveryId, fixture.courierId, 1);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'VERSION_CONFLICT');

    const persisted = await prisma.delivery.findUniqueOrThrow({
      where: { id: fixture.deliveryId },
    });
    assert.equal(persisted.status, 'ASSIGNED');
    assert.equal(persisted.version, 2);
  });

  await context.test('confirmation before pickup start is rejected without custody evidence', async () => {
    const fixture = await createAssignedReadyDelivery(baseUrl);

    const response = await confirmPickup(
      baseUrl,
      fixture.deliveryId,
      fixture.courierId,
      2,
      'Responsable prueba',
      1,
    );
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'INVALID_STATE');

    assert.equal(
      await prisma.auditLog.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: fixture.deliveryId,
          action: 'ConfirmPickup',
        },
      }),
      0,
    );
    assert.equal(
      await prisma.outboxEvent.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: fixture.deliveryId,
          eventName: 'OrderPickedUp',
        },
      }),
      0,
    );
  });

  await context.test('start and confirm pickup persist one evidence set and retries stay safe', async () => {
    const fixture = await createAssignedReadyDelivery(baseUrl);

    const started = await startPickup(baseUrl, fixture.deliveryId, fixture.courierId, 2);
    assert.equal(started.status, 200);
    assert.deepEqual(await readJson<PickupResponse>(started), {
      deliveryId: fixture.deliveryId,
      orderId: fixture.orderId,
      courierId: fixture.courierId,
      status: 'PICKUP_IN_PROGRESS',
      version: 3,
      changed: true,
    });

    const repeatedStart = await startPickup(baseUrl, fixture.deliveryId, fixture.courierId, 2);
    assert.equal(repeatedStart.status, 200);
    assert.deepEqual(await readJson<PickupResponse>(repeatedStart), {
      deliveryId: fixture.deliveryId,
      orderId: fixture.orderId,
      courierId: fixture.courierId,
      status: 'PICKUP_IN_PROGRESS',
      version: 3,
      changed: false,
    });

    const confirmed = await confirmPickup(
      baseUrl,
      fixture.deliveryId,
      fixture.courierId,
      3,
      'Ana Comercio',
      2,
    );
    assert.equal(confirmed.status, 200);
    assert.deepEqual(await readJson<PickupResponse>(confirmed), {
      deliveryId: fixture.deliveryId,
      orderId: fixture.orderId,
      courierId: fixture.courierId,
      status: 'PICKED_UP',
      version: 4,
      changed: true,
    });

    const repeatedConfirm = await confirmPickup(
      baseUrl,
      fixture.deliveryId,
      fixture.courierId,
      3,
      'Ana Comercio',
      2,
    );
    assert.equal(repeatedConfirm.status, 200);
    assert.deepEqual(await readJson<PickupResponse>(repeatedConfirm), {
      deliveryId: fixture.deliveryId,
      orderId: fixture.orderId,
      courierId: fixture.courierId,
      status: 'PICKED_UP',
      version: 4,
      changed: false,
    });

    assert.equal(
      await prisma.auditLog.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: fixture.deliveryId,
          action: 'StartPickup',
        },
      }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: fixture.deliveryId,
          action: 'ConfirmPickup',
        },
      }),
      1,
    );
    assert.equal(
      await prisma.outboxEvent.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: fixture.deliveryId,
          eventName: 'PickupStarted',
        },
      }),
      1,
    );
    assert.equal(
      await prisma.outboxEvent.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: fixture.deliveryId,
          eventName: 'OrderPickedUp',
        },
      }),
      1,
    );

    const custodyAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        aggregateType: 'Delivery',
        aggregateId: fixture.deliveryId,
        action: 'ConfirmPickup',
      },
    });
    assert.deepEqual(custodyAudit.metadata, {
      orderId: fixture.orderId,
      courierId: fixture.courierId,
      previousStatus: 'PICKUP_IN_PROGRESS',
      nextStatus: 'PICKED_UP',
      merchantResponsible: 'Ana Comercio',
      packageCount: 2,
    });

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
  });
});

async function createAssignedReadyDelivery(baseUrl: string): Promise<{
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
      'idempotency-key': `courier-pickup-${randomUUID()}`,
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

function startPickup(
  baseUrl: string,
  deliveryId: string,
  courierId: string,
  expectedVersion: number,
): Promise<Response> {
  return fetch(`${baseUrl}/courier/deliveries/${deliveryId}/start-pickup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': courierId,
    },
    body: JSON.stringify({ expectedVersion }),
  });
}

function confirmPickup(
  baseUrl: string,
  deliveryId: string,
  courierId: string,
  expectedVersion: number,
  merchantResponsible: string,
  packageCount: number,
): Promise<Response> {
  return fetch(`${baseUrl}/courier/deliveries/${deliveryId}/confirm-pickup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': courierId,
    },
    body: JSON.stringify({
      expectedVersion,
      merchantResponsible,
      packageCount,
    }),
  });
}

async function createCourier(): Promise<string> {
  const courierId = randomUUID();
  await prisma.user.create({
    data: {
      id: courierId,
      email: `pickup-courier-${courierId}@uspaya.test`,
      displayName: 'Synthetic pickup courier',
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
