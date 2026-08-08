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

interface AssignmentResponse {
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

interface UnassignedResponse {
  readonly deliveries: readonly {
    readonly id: string;
    readonly orderId: string;
    readonly status: string;
    readonly version: number;
  }[];
}

test('operations assignment preserves readiness, authorization and exclusive custody', async (context) => {
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

  await context.test('only operations can list or assign deliveries', async () => {
    const ready = await createReadyOrder(baseUrl);
    const courierId = await createCourier();

    const listResponse = await fetch(`${baseUrl}/operations/deliveries/unassigned`, {
      headers: { 'x-dev-actor-id': CUSTOMER_ID },
    });
    assert.equal(listResponse.status, 403);
    assert.equal((await readJson<ErrorResponse>(listResponse)).code, 'ROLE_FORBIDDEN');

    const assignResponse = await assignCourier(
      baseUrl,
      ready.deliveryId,
      courierId,
      1,
      CUSTOMER_ID,
    );
    assert.equal(assignResponse.status, 403);
    assert.equal((await readJson<ErrorResponse>(assignResponse)).code, 'ROLE_FORBIDDEN');
  });

  await context.test('unassigned queue contains only READY deliveries', async () => {
    const pending = await submitOrder(baseUrl);
    const ready = await createReadyOrder(baseUrl);

    const response = await fetch(`${baseUrl}/operations/deliveries/unassigned`, {
      headers: { 'x-dev-actor-id': OPERATIONS_ID },
    });
    assert.equal(response.status, 200);
    const body = await readJson<UnassignedResponse>(response);

    assert.equal(
      body.deliveries.some((delivery) => delivery.id === ready.deliveryId),
      true,
    );
    assert.equal(
      body.deliveries.some((delivery) => delivery.id === pending.deliveryId),
      false,
    );
  });

  await context.test('assignment before READY is rejected without evidence', async () => {
    const pending = await submitOrder(baseUrl);
    const courierId = await createCourier();

    const response = await assignCourier(baseUrl, pending.deliveryId, courierId, 1, OPERATIONS_ID);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'DELIVERY_NOT_ASSIGNABLE');

    assert.equal(
      await prisma.courierAssignment.count({ where: { deliveryId: pending.deliveryId } }),
      0,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          aggregateType: 'Delivery',
          aggregateId: pending.deliveryId,
          action: 'AssignCourier',
        },
      }),
      0,
    );
  });

  await context.test(
    'operations assigns once and a safe retry does not duplicate evidence',
    async () => {
      const ready = await createReadyOrder(baseUrl);
      const courierId = await createCourier();

      const assigned = await assignCourier(baseUrl, ready.deliveryId, courierId, 1, OPERATIONS_ID);
      assert.equal(assigned.status, 200);
      assert.deepEqual(await readJson<AssignmentResponse>(assigned), {
        deliveryId: ready.deliveryId,
        orderId: ready.orderId,
        courierId,
        status: 'ASSIGNED',
        version: 2,
        changed: true,
      });

      const repeated = await assignCourier(baseUrl, ready.deliveryId, courierId, 1, OPERATIONS_ID);
      assert.equal(repeated.status, 200);
      assert.deepEqual(await readJson<AssignmentResponse>(repeated), {
        deliveryId: ready.deliveryId,
        orderId: ready.orderId,
        courierId,
        status: 'ASSIGNED',
        version: 2,
        changed: false,
      });

      assert.equal(
        await prisma.courierAssignment.count({
          where: { deliveryId: ready.deliveryId, courierId, active: true },
        }),
        1,
      );
      assert.equal(
        await prisma.auditLog.count({
          where: {
            aggregateType: 'Delivery',
            aggregateId: ready.deliveryId,
            action: 'AssignCourier',
          },
        }),
        1,
      );
      assert.equal(
        await prisma.outboxEvent.count({
          where: {
            aggregateType: 'Delivery',
            aggregateId: ready.deliveryId,
            eventName: 'CourierAssigned',
          },
        }),
        1,
      );
    },
  );

  await context.test('stale version is rejected before assignment', async () => {
    const ready = await createReadyOrder(baseUrl);
    const courierId = await createCourier();

    const response = await assignCourier(baseUrl, ready.deliveryId, courierId, 2, OPERATIONS_ID);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'VERSION_CONFLICT');

    const persisted = await prisma.delivery.findUniqueOrThrow({
      where: { id: ready.deliveryId },
    });
    assert.equal(persisted.status, 'PENDING_ASSIGNMENT');
    assert.equal(persisted.version, 1);
  });

  await context.test('one courier cannot own two active deliveries', async () => {
    const first = await createReadyOrder(baseUrl);
    const second = await createReadyOrder(baseUrl);
    const courierId = await createCourier();

    const firstAssignment = await assignCourier(
      baseUrl,
      first.deliveryId,
      courierId,
      1,
      OPERATIONS_ID,
    );
    assert.equal(firstAssignment.status, 200);

    const secondAssignment = await assignCourier(
      baseUrl,
      second.deliveryId,
      courierId,
      1,
      OPERATIONS_ID,
    );
    assert.equal(secondAssignment.status, 409);
    assert.equal(
      (await readJson<ErrorResponse>(secondAssignment)).code,
      'ACTIVE_COURIER_ASSIGNMENT_CONFLICT',
    );

    assert.equal(await prisma.courierAssignment.count({ where: { courierId, active: true } }), 1);
    const secondDelivery = await prisma.delivery.findUniqueOrThrow({
      where: { id: second.deliveryId },
    });
    assert.equal(secondDelivery.status, 'PENDING_ASSIGNMENT');
    assert.equal(secondDelivery.version, 1);
  });

  await context.test('a non-courier actor cannot be assigned as courier', async () => {
    const ready = await createReadyOrder(baseUrl);

    const response = await assignCourier(baseUrl, ready.deliveryId, CUSTOMER_ID, 1, OPERATIONS_ID);
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'COURIER_NOT_AVAILABLE');
  });
});

async function createReadyOrder(baseUrl: string): Promise<{ orderId: string; deliveryId: string }> {
  const order = await submitOrder(baseUrl);

  await assertTransition(baseUrl, order.orderId, 'accept', 2);
  await assertTransition(baseUrl, order.orderId, 'start-preparation', 3);
  await assertTransition(baseUrl, order.orderId, 'ready', 4);

  return order;
}

async function submitOrder(baseUrl: string): Promise<{ orderId: string; deliveryId: string }> {
  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `operations-assignment-${randomUUID()}`,
      'x-dev-actor-id': CUSTOMER_ID,
    },
    body: JSON.stringify({
      orderId,
      deliveryId,
      paymentId: randomUUID(),
      branchId: BRANCH_ID,
      deliveryPin: '4826',
      deliveryDestination: {
        addressText: 'Av. Las Heras 120, Uspallata',
        phone: '+54 9 261 555 0101',
      },
      items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 1 }],
    }),
  });
  assert.equal(response.status, 201);
  return { orderId, deliveryId };
}

async function assertTransition(
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

function assignCourier(
  baseUrl: string,
  deliveryId: string,
  courierId: string,
  expectedVersion: number,
  actorId: string,
): Promise<Response> {
  return fetch(`${baseUrl}/operations/deliveries/${deliveryId}/assign`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': actorId,
    },
    body: JSON.stringify({ courierId, expectedVersion }),
  });
}

async function createCourier(): Promise<string> {
  const courierId = randomUUID();
  await prisma.user.create({
    data: {
      id: courierId,
      email: `courier-${courierId}@uspaya.test`,
      displayName: 'Synthetic courier',
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
