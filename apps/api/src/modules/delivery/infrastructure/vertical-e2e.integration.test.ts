import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { NestFactory } from '@nestjs/core';
import { closePrismaClient, getPrismaClient } from '@uspaya/database';

import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const OPERATIONS_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const PIN = '4826';
const prisma = getPrismaClient();

interface SubmitResponse {
  readonly orderId: string;
  readonly deliveryId: string;
  readonly status: string;
  readonly version: number;
  readonly totalCents: number;
}

interface AuditEntry {
  readonly action: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number | null;
  readonly actorId: string | null;
  readonly metadata: unknown;
  readonly createdAt: string;
}

interface AuditResponse {
  readonly orderId: string;
  readonly entries: readonly AuditEntry[];
}

interface ErrorResponse {
  readonly code: string;
  readonly correlationId: string;
}

test('Phase 3 full HTTP vertical reaches COMPLETED and exposes only scoped sanitized audit', async (context) => {
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

  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const paymentId = randomUUID();
  const courierId = await createCourier();

  const submittedResponse = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: headers(CUSTOMER_ID, {
      'idempotency-key': `phase3-e2e-submit-${randomUUID()}`,
    }),
    body: JSON.stringify({
      orderId,
      deliveryId,
      paymentId,
      branchId: BRANCH_ID,
      deliveryPin: PIN,
      deliveryDestination: {
        addressText: 'Av. Las Heras 120, Uspallata',
        phone: '+54 9 261 555 0101',
      },
      items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 1 }],
    }),
  });
  assert.equal(submittedResponse.status, 201);
  const submitted = await readJson<SubmitResponse>(submittedResponse);
  assert.equal(submitted.orderId, orderId);
  assert.equal(submitted.deliveryId, deliveryId);
  assert.equal(submitted.status, 'PENDING_MERCHANT');
  assert.equal(submitted.version, 2);

  await expectOk(
    fetch(`${baseUrl}/orders/${orderId}/accept`, {
      method: 'POST',
      headers: headers(MERCHANT_ID),
      body: JSON.stringify({ expectedVersion: 2 }),
    }),
  );
  await expectOk(
    fetch(`${baseUrl}/orders/${orderId}/start-preparation`, {
      method: 'POST',
      headers: headers(MERCHANT_ID),
      body: JSON.stringify({ expectedVersion: 3 }),
    }),
  );
  await expectOk(
    fetch(`${baseUrl}/orders/${orderId}/ready`, {
      method: 'POST',
      headers: headers(MERCHANT_ID),
      body: JSON.stringify({ expectedVersion: 4 }),
    }),
  );

  const queueResponse = await fetch(`${baseUrl}/operations/deliveries/unassigned`, {
    headers: { 'x-dev-actor-id': OPERATIONS_ID },
  });
  assert.equal(queueResponse.status, 200);
  assert.equal(JSON.stringify(await queueResponse.json()).includes(deliveryId), true);

  await expectOk(
    fetch(`${baseUrl}/operations/deliveries/${deliveryId}/assign`, {
      method: 'POST',
      headers: headers(OPERATIONS_ID),
      body: JSON.stringify({ courierId, expectedVersion: 1 }),
    }),
  );

  const activeResponse = await fetch(`${baseUrl}/courier/deliveries/active`, {
    headers: { 'x-dev-actor-id': courierId },
  });
  assert.equal(activeResponse.status, 200);
  assert.equal(JSON.stringify(await activeResponse.json()).includes(deliveryId), true);

  await expectOk(
    fetch(`${baseUrl}/courier/deliveries/${deliveryId}/start-pickup`, {
      method: 'POST',
      headers: headers(courierId),
      body: JSON.stringify({ expectedVersion: 2 }),
    }),
  );
  await expectOk(
    fetch(`${baseUrl}/courier/deliveries/${deliveryId}/confirm-pickup`, {
      method: 'POST',
      headers: headers(courierId),
      body: JSON.stringify({
        expectedVersion: 3,
        merchantResponsible: 'Responsable E2E',
        packageCount: 1,
      }),
    }),
  );
  await expectOk(
    fetch(`${baseUrl}/courier/deliveries/${deliveryId}/start-delivery`, {
      method: 'POST',
      headers: headers(courierId),
      body: JSON.stringify({ expectedVersion: 4 }),
    }),
  );
  await expectOk(
    fetch(`${baseUrl}/courier/deliveries/${deliveryId}/arrive`, {
      method: 'POST',
      headers: headers(courierId),
      body: JSON.stringify({ expectedVersion: 5 }),
    }),
  );
  await expectOk(
    fetch(`${baseUrl}/courier/deliveries/${deliveryId}/confirm-delivery`, {
      method: 'POST',
      headers: headers(courierId, {
        'idempotency-key': `phase3-e2e-delivery-${randomUUID()}`,
      }),
      body: JSON.stringify({
        expectedVersion: 6,
        pin: PIN,
        receiver: 'Cliente E2E',
        cashReceivedCents: submitted.totalCents,
      }),
    }),
  );
  await expectOk(
    fetch(`${baseUrl}/operations/orders/${orderId}/complete`, {
      method: 'POST',
      headers: headers(OPERATIONS_ID),
      body: JSON.stringify({ expectedVersion: 6 }),
    }),
  );

  const [order, delivery, payment, activeAssignments] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
    prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } }),
    prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
    prisma.courierAssignment.count({ where: { deliveryId, active: true } }),
  ]);
  assert.equal(order.status, 'COMPLETED');
  assert.equal(delivery.status, 'DELIVERED');
  assert.equal(payment.status, 'CONFIRMED');
  assert.equal(activeAssignments, 0);

  await prisma.auditLog.create({
    data: {
      id: randomUUID(),
      actorId: OPERATIONS_ID,
      action: 'SyntheticAuditSanitizationProbe',
      aggregateType: 'Order',
      aggregateId: orderId,
      aggregateVersion: order.version,
      metadata: {
        safe: 'visible',
        pin: PIN,
        nested: {
          requestHash: 'must-not-leak',
          token: 'must-not-leak',
          safeNested: 'visible-nested',
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      id: randomUUID(),
      actorId: OPERATIONS_ID,
      action: 'SyntheticCrossAggregateProbe',
      aggregateType: 'Incident',
      aggregateId: orderId,
      aggregateVersion: 1,
      metadata: { marker: 'cross-aggregate-must-not-leak' },
    },
  });

  for (const actorId of [CUSTOMER_ID, MERCHANT_ID, courierId]) {
    const denied = await fetch(`${baseUrl}/operations/orders/${orderId}/audit`, {
      headers: { 'x-dev-actor-id': actorId },
    });
    assert.equal(denied.status, 403);
    const body = await readJson<ErrorResponse>(denied);
    assert.equal(body.code, 'ROLE_FORBIDDEN');
    assert.ok(body.correlationId.length > 0);
  }

  const missing = await fetch(`${baseUrl}/operations/orders/${randomUUID()}/audit`, {
    headers: { 'x-dev-actor-id': OPERATIONS_ID },
  });
  assert.equal(missing.status, 404);
  assert.equal((await readJson<ErrorResponse>(missing)).code, 'ORDER_NOT_FOUND');

  const auditResponse = await fetch(`${baseUrl}/operations/orders/${orderId}/audit`, {
    headers: { 'x-dev-actor-id': OPERATIONS_ID },
  });
  assert.equal(auditResponse.status, 200);
  const audit = await readJson<AuditResponse>(auditResponse);
  assert.equal(audit.orderId, orderId);
  assert.ok(audit.entries.length >= 14);

  const actions = new Set(audit.entries.map((entry) => entry.action));
  for (const action of [
    'SubmitOrder',
    'AcceptOrder',
    'StartOrderPreparation',
    'MarkOrderReady',
    'AssignCourier',
    'StartPickup',
    'ConfirmPickup',
    'StartDelivery',
    'ReportCourierArrival',
    'ConfirmDelivery',
    'ConfirmPayment',
    'MarkOrderFulfilled',
    'ReleaseCourierAssignment',
    'CompleteOrder',
    'SyntheticAuditSanitizationProbe',
  ]) {
    assert.equal(actions.has(action), true, `missing audit action ${action}`);
  }
  assert.equal(actions.has('SyntheticCrossAggregateProbe'), false);

  const serializedAudit = JSON.stringify(audit);
  assert.equal(serializedAudit.includes(PIN), false);
  assert.equal(serializedAudit.includes('must-not-leak'), false);
  assert.equal(serializedAudit.includes('cross-aggregate-must-not-leak'), false);
  assert.equal(serializedAudit.includes('visible'), true);
  assert.equal(serializedAudit.includes('visible-nested'), true);
});

function headers(actorId: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-dev-actor-id': actorId,
    ...extra,
  };
}

async function expectOk(responsePromise: Promise<Response>): Promise<void> {
  const response = await responsePromise;
  assert.equal(response.status, 200, await response.text());
}

async function createCourier(): Promise<string> {
  const courierId = randomUUID();
  await prisma.user.create({
    data: {
      id: courierId,
      email: `phase3-e2e-${courierId}@uspaya.test`,
      displayName: 'Synthetic Phase 3 courier',
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
