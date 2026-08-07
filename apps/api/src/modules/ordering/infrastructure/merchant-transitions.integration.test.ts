import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { NestFactory } from '@nestjs/core';
import { closePrismaClient, getPrismaClient } from '@uspaya/database';

import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const MERCHANT_OPERATOR_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const prisma = getPrismaClient();

interface TransitionResponse {
  readonly orderId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

interface ErrorResponse {
  readonly code: string;
  readonly correlationId: string;
}

test('merchant order transitions preserve authorization, version and transactional evidence', async (context) => {
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

  await context.test('a customer cannot execute merchant transitions', async () => {
    const order = await submitOrder(baseUrl, BRANCH_ID, PRODUCT_ID);
    const response = await transitionOrder(
      baseUrl,
      order.orderId,
      'accept',
      order.version,
      CUSTOMER_ID,
    );

    assert.equal(response.status, 403);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'ROLE_FORBIDDEN');
  });

  await context.test('a merchant cannot infer or mutate an order outside its branch scope', async () => {
    const merchantId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();
    await prisma.merchant.create({
      data: {
        id: merchantId,
        name: 'Foreign merchant for scope test',
        branches: {
          create: {
            id: branchId,
            name: 'Foreign branch',
            addressLine: 'Synthetic test address',
            products: {
              create: {
                id: productId,
                sku: `SCOPE-${randomUUID()}`,
                name: 'Synthetic scoped product',
                priceCents: 1000,
              },
            },
          },
        },
      },
    });

    const order = await submitOrder(baseUrl, branchId, productId);
    const response = await transitionOrder(
      baseUrl,
      order.orderId,
      'accept',
      order.version,
      MERCHANT_OPERATOR_ID,
    );

    assert.equal(response.status, 404);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'ORDER_NOT_FOUND');
  });

  await context.test('accept, prepare and ready persist one audit and one Outbox event each', async () => {
    const order = await submitOrder(baseUrl, BRANCH_ID, PRODUCT_ID);

    const accepted = await transitionOrder(
      baseUrl,
      order.orderId,
      'accept',
      order.version,
      MERCHANT_OPERATOR_ID,
    );
    assert.equal(accepted.status, 200);
    assert.deepEqual(await readJson<TransitionResponse>(accepted), {
      orderId: order.orderId,
      status: 'ACCEPTED',
      version: 3,
      changed: true,
    });

    const repeatedAccept = await transitionOrder(
      baseUrl,
      order.orderId,
      'accept',
      order.version,
      MERCHANT_OPERATOR_ID,
    );
    assert.equal(repeatedAccept.status, 200);
    assert.deepEqual(await readJson<TransitionResponse>(repeatedAccept), {
      orderId: order.orderId,
      status: 'ACCEPTED',
      version: 3,
      changed: false,
    });

    const preparing = await transitionOrder(
      baseUrl,
      order.orderId,
      'start-preparation',
      3,
      MERCHANT_OPERATOR_ID,
    );
    assert.equal(preparing.status, 200);
    assert.equal((await readJson<TransitionResponse>(preparing)).status, 'PREPARING');

    const ready = await transitionOrder(
      baseUrl,
      order.orderId,
      'ready',
      4,
      MERCHANT_OPERATOR_ID,
    );
    assert.equal(ready.status, 200);
    assert.deepEqual(await readJson<TransitionResponse>(ready), {
      orderId: order.orderId,
      status: 'READY',
      version: 5,
      changed: true,
    });

    const audit = await prisma.auditLog.findMany({
      where: {
        aggregateType: 'Order',
        aggregateId: order.orderId,
        action: { in: ['AcceptOrder', 'StartOrderPreparation', 'MarkOrderReady'] },
      },
      orderBy: { aggregateVersion: 'asc' },
    });
    assert.deepEqual(
      audit.map((entry) => [entry.action, entry.aggregateVersion]),
      [
        ['AcceptOrder', 3],
        ['StartOrderPreparation', 4],
        ['MarkOrderReady', 5],
      ],
    );

    const outbox = await prisma.outboxEvent.findMany({
      where: {
        aggregateType: 'Order',
        aggregateId: order.orderId,
        eventName: { in: ['OrderAccepted', 'OrderPreparationStarted', 'OrderReady'] },
      },
      orderBy: { aggregateVersion: 'asc' },
    });
    assert.deepEqual(
      outbox.map((event) => [event.eventName, event.aggregateVersion]),
      [
        ['OrderAccepted', 3],
        ['OrderPreparationStarted', 4],
        ['OrderReady', 5],
      ],
    );
  });

  await context.test('a stale expected version is rejected without advancing the order', async () => {
    const order = await submitOrder(baseUrl, BRANCH_ID, PRODUCT_ID);
    const accepted = await transitionOrder(
      baseUrl,
      order.orderId,
      'accept',
      order.version,
      MERCHANT_OPERATOR_ID,
    );
    assert.equal(accepted.status, 200);

    const stale = await transitionOrder(
      baseUrl,
      order.orderId,
      'start-preparation',
      order.version,
      MERCHANT_OPERATOR_ID,
    );
    assert.equal(stale.status, 409);
    assert.equal((await readJson<ErrorResponse>(stale)).code, 'VERSION_CONFLICT');

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    assert.equal(persisted.status, 'ACCEPTED');
    assert.equal(persisted.version, 3);
    assert.equal(
      await prisma.auditLog.count({
        where: { aggregateId: order.orderId, action: 'StartOrderPreparation' },
      }),
      0,
    );
  });
});

async function submitOrder(
  baseUrl: string,
  branchId: string,
  productId: string,
): Promise<{ orderId: string; version: number }> {
  const orderId = randomUUID();
  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `merchant-transition-${randomUUID()}`,
      'x-dev-actor-id': CUSTOMER_ID,
    },
    body: JSON.stringify({
      orderId,
      deliveryId: randomUUID(),
      paymentId: randomUUID(),
      branchId,
      deliveryPin: '4826',
      items: [{ itemId: randomUUID(), productId, quantity: 1 }],
    }),
  });
  assert.equal(response.status, 201);
  const body = await readJson<{ orderId: string; version: number }>(response);
  return { orderId: body.orderId, version: body.version };
}

function transitionOrder(
  baseUrl: string,
  orderId: string,
  action: 'accept' | 'start-preparation' | 'ready',
  expectedVersion: number,
  actorId: string,
): Promise<Response> {
  return fetch(`${baseUrl}/orders/${orderId}/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-actor-id': actorId,
    },
    body: JSON.stringify({ expectedVersion }),
  });
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
