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
const PIN = '4826';
const prisma = getPrismaClient();

interface FinalDeliveryResponse {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly deliveryStatus: string;
  readonly paymentStatus: string;
  readonly orderStatus: string;
  readonly deliveryVersion: number;
  readonly paymentVersion: number;
  readonly orderVersion: number;
  readonly changed: boolean;
}

interface CompleteOrderResponse {
  readonly orderId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

interface ErrorResponse {
  readonly code: string;
  readonly correlationId: string;
}

test('final delivery atomically closes custody, cash and fulfillment before order completion', async (context) => {
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

  await context.test('PIN failure rolls back delivery, payment, order and assignment', async () => {
    const fixture = await createArrivedDelivery(baseUrl);
    const before = await loadState(fixture);

    const response = await confirmDelivery(baseUrl, fixture, {
      key: `final-wrong-pin-${randomUUID()}`,
      pin: '9999',
      cashReceivedCents: fixture.totalCents,
    });
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'BUSINESS_RULE_VIOLATION');

    assert.deepEqual(await loadState(fixture), before);
    assert.equal(await finalEvidenceCount(fixture), 0);
  });

  await context.test('cash mismatch rolls back every finalization effect', async () => {
    const fixture = await createArrivedDelivery(baseUrl);
    const before = await loadState(fixture);

    const response = await confirmDelivery(baseUrl, fixture, {
      key: `final-wrong-cash-${randomUUID()}`,
      pin: PIN,
      cashReceivedCents: fixture.totalCents - 1,
    });
    assert.equal(response.status, 409);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'BUSINESS_RULE_VIOLATION');

    assert.deepEqual(await loadState(fixture), before);
    assert.equal(await finalEvidenceCount(fixture), 0);
  });

  await context.test('another courier cannot infer or finalize the delivery', async () => {
    const fixture = await createArrivedDelivery(baseUrl);
    const otherCourierId = await createCourier();

    const response = await confirmDelivery(
      baseUrl,
      { ...fixture, courierId: otherCourierId },
      {
        key: `final-other-courier-${randomUUID()}`,
        pin: PIN,
        cashReceivedCents: fixture.totalCents,
      },
    );
    assert.equal(response.status, 404);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'DELIVERY_NOT_FOUND');
    assert.equal(await finalEvidenceCount(fixture), 0);
  });

  await context.test('same key and request return one atomic finalization result', async () => {
    const fixture = await createArrivedDelivery(baseUrl);
    const key = `final-success-${randomUUID()}`;

    const first = await confirmDelivery(baseUrl, fixture, {
      key,
      pin: PIN,
      cashReceivedCents: fixture.totalCents,
    });
    assert.equal(first.status, 200);
    const firstBody = await readJson<FinalDeliveryResponse>(first);
    assert.deepEqual(firstBody, {
      deliveryId: fixture.deliveryId,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      deliveryStatus: 'DELIVERED',
      paymentStatus: 'CONFIRMED',
      orderStatus: 'FULFILLED',
      deliveryVersion: 7,
      paymentVersion: 2,
      orderVersion: 6,
      changed: true,
    });

    const repeated = await confirmDelivery(baseUrl, fixture, {
      key,
      pin: PIN,
      cashReceivedCents: fixture.totalCents,
    });
    assert.equal(repeated.status, 200);
    assert.deepEqual(await readJson<FinalDeliveryResponse>(repeated), firstBody);

    const state = await loadState(fixture);
    assert.deepEqual(state, {
      deliveryStatus: 'DELIVERED',
      deliveryVersion: 7,
      paymentStatus: 'CONFIRMED',
      paymentVersion: 2,
      orderStatus: 'FULFILLED',
      orderVersion: 6,
      activeAssignments: 0,
    });

    assert.equal(
      await prisma.auditLog.count({
        where: {
          OR: [
            { aggregateType: 'Delivery', aggregateId: fixture.deliveryId, action: 'ConfirmDelivery' },
            { aggregateType: 'Payment', aggregateId: fixture.paymentId, action: 'ConfirmPayment' },
            { aggregateType: 'Order', aggregateId: fixture.orderId, action: 'MarkOrderFulfilled' },
            {
              aggregateType: 'Delivery',
              aggregateId: fixture.deliveryId,
              action: 'ReleaseCourierAssignment',
            },
          ],
        },
      }),
      4,
    );
    assert.equal(
      await prisma.outboxEvent.count({
        where: {
          OR: [
            { aggregateType: 'Delivery', aggregateId: fixture.deliveryId, eventName: 'DeliveryCompleted' },
            { aggregateType: 'Payment', aggregateId: fixture.paymentId, eventName: 'PaymentConfirmed' },
            { aggregateType: 'Order', aggregateId: fixture.orderId, eventName: 'OrderFulfilled' },
            {
              aggregateType: 'Delivery',
              aggregateId: fixture.deliveryId,
              eventName: 'CourierAssignmentReleased',
            },
          ],
        },
      }),
      4,
    );

    const deliveryAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        aggregateType: 'Delivery',
        aggregateId: fixture.deliveryId,
        action: 'ConfirmDelivery',
      },
    });
    assert.equal(JSON.stringify(deliveryAudit.metadata).includes(PIN), false);
  });

  await context.test('same key with different money is rejected without duplicate effects', async () => {
    const fixture = await createArrivedDelivery(baseUrl);
    const key = `final-conflict-${randomUUID()}`;

    const first = await confirmDelivery(baseUrl, fixture, {
      key,
      pin: PIN,
      cashReceivedCents: fixture.totalCents,
    });
    assert.equal(first.status, 200);

    const conflicting = await confirmDelivery(baseUrl, fixture, {
      key,
      pin: PIN,
      cashReceivedCents: fixture.totalCents - 1,
    });
    assert.equal(conflicting.status, 409);
    assert.equal((await readJson<ErrorResponse>(conflicting)).code, 'IDEMPOTENCY_KEY_CONFLICT');
    assert.equal(await finalEvidenceCount(fixture), 8);
  });

  await context.test('operations completes only a fulfilled, paid and released order', async () => {
    const fixture = await createArrivedDelivery(baseUrl);

    const premature = await completeOrder(baseUrl, fixture.orderId, 5);
    assert.equal(premature.status, 409);
    assert.equal((await readJson<ErrorResponse>(premature)).code, 'ORDER_NOT_COMPLETABLE');

    const deliveryResponse = await confirmDelivery(baseUrl, fixture, {
      key: `final-complete-${randomUUID()}`,
      pin: PIN,
      cashReceivedCents: fixture.totalCents,
    });
    assert.equal(deliveryResponse.status, 200);

    const completed = await completeOrder(baseUrl, fixture.orderId, 6);
    assert.equal(completed.status, 200);
    assert.deepEqual(await readJson<CompleteOrderResponse>(completed), {
      orderId: fixture.orderId,
      status: 'COMPLETED',
      version: 7,
      changed: true,
    });

    const repeated = await completeOrder(baseUrl, fixture.orderId, 6);
    assert.equal(repeated.status, 200);
    assert.deepEqual(await readJson<CompleteOrderResponse>(repeated), {
      orderId: fixture.orderId,
      status: 'COMPLETED',
      version: 7,
      changed: false,
    });

    assert.equal(
      await prisma.outboxEvent.count({
        where: { aggregateType: 'Order', aggregateId: fixture.orderId, eventName: 'OrderCompleted' },
      }),
      1,
    );
  });
});

async function createArrivedDelivery(baseUrl: string): Promise<{
  orderId: string;
  deliveryId: string;
  paymentId: string;
  courierId: string;
  totalCents: number;
}> {
  const order = await submitOrder(baseUrl);
  await orderTransition(baseUrl, order.orderId, 'accept', 2);
  await orderTransition(baseUrl, order.orderId, 'start-preparation', 3);
  await orderTransition(baseUrl, order.orderId, 'ready', 4);

  const courierId = await createCourier();
  let response = await fetch(`${baseUrl}/operations/deliveries/${order.deliveryId}/assign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-actor-id': OPERATIONS_ID },
    body: JSON.stringify({ courierId, expectedVersion: 1 }),
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/courier/deliveries/${order.deliveryId}/start-pickup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-actor-id': courierId },
    body: JSON.stringify({ expectedVersion: 2 }),
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/courier/deliveries/${order.deliveryId}/confirm-pickup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-actor-id': courierId },
    body: JSON.stringify({
      expectedVersion: 3,
      merchantResponsible: 'Responsable comercio',
      packageCount: 1,
    }),
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/courier/deliveries/${order.deliveryId}/start-delivery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-actor-id': courierId },
    body: JSON.stringify({ expectedVersion: 4 }),
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/courier/deliveries/${order.deliveryId}/arrive`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-actor-id': courierId },
    body: JSON.stringify({ expectedVersion: 5 }),
  });
  assert.equal(response.status, 200);

  return { ...order, courierId };
}

async function submitOrder(baseUrl: string): Promise<{
  orderId: string;
  deliveryId: string;
  paymentId: string;
  totalCents: number;
}> {
  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const paymentId = randomUUID();
  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `final-submit-${randomUUID()}`,
      'x-dev-actor-id': CUSTOMER_ID,
    },
    body: JSON.stringify({
      orderId,
      deliveryId,
      paymentId,
      branchId: BRANCH_ID,
      deliveryPin: PIN,
      items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 1 }],
    }),
  });
  assert.equal(response.status, 201);
  const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return { orderId, deliveryId, paymentId, totalCents: persisted.totalCents };
}

async function orderTransition(
  baseUrl: string,
  orderId: string,
  action: 'accept' | 'start-preparation' | 'ready',
  expectedVersion: number,
): Promise<void> {
  const response = await fetch(`${baseUrl}/orders/${orderId}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-actor-id': MERCHANT_OPERATOR_ID },
    body: JSON.stringify({ expectedVersion }),
  });
  assert.equal(response.status, 200);
}

function confirmDelivery(
  baseUrl: string,
  fixture: { deliveryId: string; courierId: string },
  input: { key: string; pin: string; cashReceivedCents: number },
): Promise<Response> {
  return fetch(`${baseUrl}/courier/deliveries/${fixture.deliveryId}/confirm-delivery`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': input.key,
      'x-dev-actor-id': fixture.courierId,
    },
    body: JSON.stringify({
      expectedVersion: 6,
      pin: input.pin,
      receiver: 'Cliente receptor',
      cashReceivedCents: input.cashReceivedCents,
    }),
  });
}

function completeOrder(baseUrl: string, orderId: string, expectedVersion: number): Promise<Response> {
  return fetch(`${baseUrl}/operations/orders/${orderId}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-actor-id': OPERATIONS_ID },
    body: JSON.stringify({ expectedVersion }),
  });
}

async function loadState(fixture: { orderId: string; deliveryId: string; paymentId: string }) {
  const [delivery, payment, order, activeAssignments] = await Promise.all([
    prisma.delivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } }),
    prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
    prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    prisma.courierAssignment.count({ where: { deliveryId: fixture.deliveryId, active: true } }),
  ]);
  return {
    deliveryStatus: delivery.status,
    deliveryVersion: delivery.version,
    paymentStatus: payment.status,
    paymentVersion: payment.version,
    orderStatus: order.status,
    orderVersion: order.version,
    activeAssignments,
  };
}

async function finalEvidenceCount(fixture: {
  orderId: string;
  deliveryId: string;
  paymentId: string;
}): Promise<number> {
  const [audit, outbox] = await Promise.all([
    prisma.auditLog.count({
      where: {
        OR: [
          { aggregateId: fixture.deliveryId, action: 'ConfirmDelivery' },
          { aggregateId: fixture.paymentId, action: 'ConfirmPayment' },
          { aggregateId: fixture.orderId, action: 'MarkOrderFulfilled' },
          { aggregateId: fixture.deliveryId, action: 'ReleaseCourierAssignment' },
        ],
      },
    }),
    prisma.outboxEvent.count({
      where: {
        OR: [
          { aggregateId: fixture.deliveryId, eventName: 'DeliveryCompleted' },
          { aggregateId: fixture.paymentId, eventName: 'PaymentConfirmed' },
          { aggregateId: fixture.orderId, eventName: 'OrderFulfilled' },
          { aggregateId: fixture.deliveryId, eventName: 'CourierAssignmentReleased' },
        ],
      },
    }),
  ]);
  return audit + outbox;
}

async function createCourier(): Promise<string> {
  const courierId = randomUUID();
  await prisma.user.create({
    data: {
      id: courierId,
      email: `final-courier-${courierId}@uspaya.test`,
      displayName: 'Synthetic final courier',
      roleAssignments: { create: { id: randomUUID(), role: 'COURIER' } },
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
