import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { PrismaService } from '../../../shared/database/prisma.service';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const MERCHANT_OPERATOR_ID = '22222222-2222-4222-8222-222222222222';
const OPERATIONS_ID = '33333333-3333-4333-8333-333333333333';
const COURIER_ID = '44444444-4444-4444-8444-444444444444';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

interface ErrorResponse {
  readonly code: string;
}

interface MerchantInboxOrderResponse {
  readonly orderId: string;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
  readonly status: string;
  readonly version: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: string | null;
  readonly deliveryStatus: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface TransitionResponse {
  readonly orderId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

test('merchant order inbox is scoped and follows the first vertical', async (context) => {
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
  const prisma = app.get(PrismaService).client;

  const submittedOrderId = randomUUID();
  const submittedDeliveryId = randomUUID();
  const submittedPaymentId = randomUUID();
  const submittedItemId = randomUUID();
  const submittedIdempotencyKey = `merchant-flow-${randomUUID()}`;
  const olderOrderId = randomUUID();
  const terminalOrderId = randomUUID();
  const foreignMerchantId = randomUUID();
  const foreignBranchId = randomUUID();
  const foreignOrderId = randomUUID();

  context.after(async () => {
    await prisma.order.deleteMany({
      where: {
        id: { in: [submittedOrderId, olderOrderId, terminalOrderId, foreignOrderId] },
      },
    });
    await prisma.idempotencyRecord.deleteMany({ where: { key: submittedIdempotencyKey } });
    await prisma.branch.deleteMany({ where: { id: foreignBranchId } });
    await prisma.merchant.deleteMany({ where: { id: foreignMerchantId } });
    await app.close();
    restoreEnvironment('NODE_ENV', originalNodeEnv);
    restoreEnvironment('DEV_IDENTITY_ENABLED', originalDevIdentity);
  });

  await prisma.order.create({
    data: {
      id: olderOrderId,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      status: 'PENDING_MERCHANT',
      version: 1,
      totalCents: 100,
      currency: 'ARS',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    },
  });
  await prisma.order.create({
    data: {
      id: terminalOrderId,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      status: 'COMPLETED',
      version: 7,
      totalCents: 300,
      currency: 'ARS',
    },
  });

  await prisma.merchant.create({
    data: { id: foreignMerchantId, name: `Foreign ${foreignMerchantId}`, active: true },
  });
  await prisma.branch.create({
    data: {
      id: foreignBranchId,
      merchantId: foreignMerchantId,
      name: 'Foreign branch',
      addressLine: 'Outside merchant scope',
      active: true,
    },
  });
  await prisma.order.create({
    data: {
      id: foreignOrderId,
      branchId: foreignBranchId,
      customerId: CUSTOMER_ID,
      status: 'PENDING_MERCHANT',
      version: 1,
      totalCents: 200,
      currency: 'ARS',
    },
  });

  await context.test('only merchant operators may query the merchant inbox', async () => {
    for (const actorId of [CUSTOMER_ID, OPERATIONS_ID, COURIER_ID]) {
      const response = await fetch(`${baseUrl}/merchant/orders`, {
        headers: actorHeaders(actorId),
      });
      assert.equal(response.status, 403);
      assert.equal((await readJson<ErrorResponse>(response)).code, 'ROLE_FORBIDDEN');
    }
  });

  await context.test('merchant sees only scoped open orders in stable order', async () => {
    const submitResponse = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        ...actorHeaders(CUSTOMER_ID),
        'content-type': 'application/json',
        'idempotency-key': submittedIdempotencyKey,
      },
      body: JSON.stringify({
        orderId: submittedOrderId,
        deliveryId: submittedDeliveryId,
        paymentId: submittedPaymentId,
        branchId: BRANCH_ID,
        deliveryPin: '4826',
        items: [{ itemId: submittedItemId, productId: PRODUCT_ID, quantity: 1 }],
      }),
    });
    assert.equal(submitResponse.status, 201);

    const response = await fetch(`${baseUrl}/merchant/orders`, {
      headers: actorHeaders(MERCHANT_OPERATOR_ID),
    });
    assert.equal(response.status, 200);
    const orders = await readJson<MerchantInboxOrderResponse[]>(response);

    assert.equal(orders[0]?.orderId, olderOrderId);
    const submitted = orders.find((order) => order.orderId === submittedOrderId);
    assert.ok(submitted);
    assert.equal(submitted.branch.id, BRANCH_ID);
    assert.equal(submitted.status, 'PENDING_MERCHANT');
    assert.equal(submitted.version, 1);
    assert.equal(submitted.paymentStatus, 'PENDING');
    assert.equal(submitted.deliveryStatus, 'PENDING_ASSIGNMENT');
    assert.equal(orders.some((order) => order.orderId === foreignOrderId), false);
    assert.equal(orders.some((order) => order.orderId === terminalOrderId), false);
  });

  await context.test('merchant keeps the order visible through READY', async () => {
    const accepted = await transition(baseUrl, submittedOrderId, 'accept', 1);
    assert.equal(accepted.status, 'ACCEPTED');
    assert.equal(accepted.version, 2);
    assert.equal(accepted.changed, true);
    await assertInboxStatus(baseUrl, submittedOrderId, 'ACCEPTED', 2);

    const preparing = await transition(baseUrl, submittedOrderId, 'start-preparation', 2);
    assert.equal(preparing.status, 'PREPARING');
    assert.equal(preparing.version, 3);
    await assertInboxStatus(baseUrl, submittedOrderId, 'PREPARING', 3);

    const ready = await transition(baseUrl, submittedOrderId, 'ready', 3);
    assert.equal(ready.status, 'READY');
    assert.equal(ready.version, 4);
    await assertInboxStatus(baseUrl, submittedOrderId, 'READY', 4);
  });
});

async function assertInboxStatus(
  baseUrl: string,
  orderId: string,
  expectedStatus: string,
  expectedVersion: number,
): Promise<void> {
  const response = await fetch(`${baseUrl}/merchant/orders`, {
    headers: actorHeaders(MERCHANT_OPERATOR_ID),
  });
  assert.equal(response.status, 200);
  const orders = await readJson<MerchantInboxOrderResponse[]>(response);
  const order = orders.find((candidate) => candidate.orderId === orderId);
  assert.ok(order);
  assert.equal(order.status, expectedStatus);
  assert.equal(order.version, expectedVersion);
}

async function transition(
  baseUrl: string,
  orderId: string,
  action: 'accept' | 'start-preparation' | 'ready',
  expectedVersion: number,
): Promise<TransitionResponse> {
  const response = await fetch(`${baseUrl}/orders/${orderId}/${action}`, {
    method: 'POST',
    headers: {
      ...actorHeaders(MERCHANT_OPERATOR_ID),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ expectedVersion }),
  });
  assert.equal(response.status, 200);
  return readJson<TransitionResponse>(response);
}

function actorHeaders(actorId: string): Record<string, string> {
  return { 'x-dev-actor-id': actorId };
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
