import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApplication } from './configure-application';
import { assertDevelopmentIdentityConfiguration } from './shared/security/development-identity.guard';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const COURIER_ID = '44444444-4444-4444-8444-444444444444';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

interface ErrorResponse {
  readonly code: string;
  readonly correlationId?: string;
}

interface ActorResponse {
  readonly userId: string;
  readonly roles: readonly string[];
}

interface CatalogResponse {
  readonly branch: { readonly id: string };
  readonly products: readonly unknown[];
}

interface SubmitOrderResponse {
  readonly orderId: string;
  readonly status: string;
  readonly [key: string]: unknown;
}

interface OrderResponse {
  readonly id: string;
  readonly totalCents: number;
  readonly [key: string]: unknown;
}

test('Phase 3 HTTP foundation', async (context) => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevIdentity = process.env.DEV_IDENTITY_ENABLED;

  process.env.NODE_ENV = 'production';
  process.env.DEV_IDENTITY_ENABLED = 'true';
  assert.throws(
    () => assertDevelopmentIdentityConfiguration(),
    /cannot be true when NODE_ENV is production/,
  );

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
    restoreEnvironment('NODE_ENV', originalNodeEnv);
    restoreEnvironment('DEV_IDENTITY_ENABLED', originalDevIdentity);
  });

  await context.test('health remains public and returns a correlation id', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-correlation-id'));
    const body = await readJson<{ service: string; status: string; timestamp: string }>(response);
    assert.equal(body.service, 'api');
    assert.equal(body.status, 'ok');
    assert.equal(Number.isNaN(Date.parse(body.timestamp)), false);
  });

  await context.test('protected endpoints require an explicit development actor', async () => {
    const response = await fetch(`${baseUrl}/actors/me`);
    assert.equal(response.status, 401);
    const body = await readJson<ErrorResponse>(response);
    assert.equal(body.code, 'DEVELOPMENT_ACTOR_REQUIRED');
    assert.equal(typeof body.correlationId, 'string');
  });

  await context.test('seeded actor identity exposes only its own roles and scopes', async () => {
    const response = await fetch(`${baseUrl}/actors/me`, {
      headers: actorHeaders(CUSTOMER_ID),
    });
    assert.equal(response.status, 200);
    const body = await readJson<ActorResponse>(response);
    assert.equal(body.userId, CUSTOMER_ID);
    assert.deepEqual(body.roles, ['CUSTOMER']);
  });

  await context.test('catalog enforces roles and returns active seeded products', async () => {
    const forbidden = await fetch(`${baseUrl}/catalog/branches/${BRANCH_ID}/products`, {
      headers: actorHeaders(COURIER_ID),
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await readJson<ErrorResponse>(forbidden)).code, 'ROLE_FORBIDDEN');

    const allowed = await fetch(`${baseUrl}/catalog/branches/${BRANCH_ID}/products`, {
      headers: actorHeaders(CUSTOMER_ID),
    });
    assert.equal(allowed.status, 200);
    const catalog = await readJson<CatalogResponse>(allowed);
    assert.equal(catalog.branch.id, BRANCH_ID);
    assert.equal(catalog.products.length, 2);
  });

  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const paymentId = randomUUID();
  const itemId = randomUUID();
  const idempotencyKey = `api-order-${randomUUID()}`;
  const orderBody = {
    orderId,
    deliveryId,
    paymentId,
    branchId: BRANCH_ID,
    deliveryPin: '4826',
    items: [{ itemId, productId: PRODUCT_ID, quantity: 2 }],
  };

  await context.test('order submission requires Idempotency-Key', async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        ...actorHeaders(CUSTOMER_ID),
        'content-type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    assert.equal(response.status, 400);
    assert.equal((await readJson<ErrorResponse>(response)).code, 'IDEMPOTENCY_KEY_REQUIRED');
  });

  await context.test('validation rejects unknown fields with a stable envelope', async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        ...actorHeaders(CUSTOMER_ID),
        'content-type': 'application/json',
        'idempotency-key': `invalid-${randomUUID()}`,
      },
      body: JSON.stringify({ ...orderBody, unsupported: true }),
    });
    assert.equal(response.status, 400);
    const body = await readJson<ErrorResponse>(response);
    assert.equal(body.code, 'VALIDATION_FAILED');
    assert.equal(typeof body.correlationId, 'string');
  });

  let firstSubmission: SubmitOrderResponse | undefined;

  await context.test('same order request and key recover one stored result', async () => {
    const first = await submitOrder(baseUrl, idempotencyKey, orderBody);
    assert.equal(first.response.status, 201);
    firstSubmission = first.body;
    assert.equal(first.body.orderId, orderId);
    assert.equal(first.body.status, 'PENDING_MERCHANT');

    const repeated = await submitOrder(baseUrl, idempotencyKey, orderBody);
    assert.equal(repeated.response.status, 201);
    assert.deepEqual(repeated.body, firstSubmission);
  });

  await context.test('order projection is scoped and never exposes the PIN hash', async () => {
    const allowed = await fetch(`${baseUrl}/orders/${orderId}`, {
      headers: actorHeaders(CUSTOMER_ID),
    });
    assert.equal(allowed.status, 200);
    const body = await readJson<OrderResponse>(allowed);
    assert.equal(body.id, orderId);
    assert.equal(body.totalCents, 900000);
    assert.equal('pinHash' in body, false);

    const hidden = await fetch(`${baseUrl}/orders/${orderId}`, {
      headers: actorHeaders(COURIER_ID),
    });
    assert.equal(hidden.status, 404);
    assert.equal((await readJson<ErrorResponse>(hidden)).code, 'ORDER_NOT_FOUND');
  });
});

function actorHeaders(actorId: string): Record<string, string> {
  return { 'x-dev-actor-id': actorId };
}

async function submitOrder(
  baseUrl: string,
  idempotencyKey: string,
  body: Record<string, unknown>,
): Promise<{ response: Response; body: SubmitOrderResponse }> {
  const response = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      ...actorHeaders(CUSTOMER_ID),
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson<SubmitOrderResponse>(response) };
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
