import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@uspaya/database';

import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { PrismaService } from '../../../shared/database/prisma.service';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const MERCHANT_OPERATOR_ID = '22222222-2222-4222-8222-222222222222';
const OPERATIONS_ID = '33333333-3333-4333-8333-333333333333';
const COURIER_ID = '44444444-4444-4444-8444-444444444444';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';

interface ErrorResponse {
  readonly code: string;
}

interface AvailableCourierResponse {
  readonly courierId: string;
  readonly displayName: string;
}

interface PendingCompletionOrderResponse {
  readonly orderId: string;
  readonly version: number;
  readonly branch: { readonly id: string; readonly name: string };
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: string;
  readonly deliveryStatus: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

test('operations discovery read models are minimal, scoped and completion-safe', async (context) => {
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

  const availableCourierId = randomUUID();
  const busyCourierId = randomUUID();
  const inactiveCourierId = randomUUID();
  const nonCourierId = randomUUID();
  const syntheticUserIds = [availableCourierId, busyCourierId, inactiveCourierId, nonCourierId];

  const eligibleOrderId = randomUUID();
  const badPaymentOrderId = randomUUID();
  const badDeliveryOrderId = randomUUID();
  const activeAssignmentOrderId = randomUUID();
  const readyOrderId = randomUUID();
  const syntheticOrderIds = [
    eligibleOrderId,
    badPaymentOrderId,
    badDeliveryOrderId,
    activeAssignmentOrderId,
    readyOrderId,
  ];

  context.after(async () => {
    await prisma.courierAssignment.deleteMany({ where: { courierId: { in: syntheticUserIds } } });
    await prisma.order.deleteMany({ where: { id: { in: syntheticOrderIds } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: syntheticUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: syntheticUserIds } } });
    await app.close();
    restoreEnvironment('NODE_ENV', originalNodeEnv);
    restoreEnvironment('DEV_IDENTITY_ENABLED', originalDevIdentity);
  });

  await prisma.user.createMany({
    data: [
      {
        id: availableCourierId,
        email: `available-${availableCourierId}@example.test`,
        displayName: 'Available Courier',
        active: true,
      },
      {
        id: busyCourierId,
        email: `busy-${busyCourierId}@example.test`,
        displayName: 'Busy Courier',
        active: true,
      },
      {
        id: inactiveCourierId,
        email: `inactive-${inactiveCourierId}@example.test`,
        displayName: 'Inactive Courier',
        active: false,
      },
      {
        id: nonCourierId,
        email: `noncourier-${nonCourierId}@example.test`,
        displayName: 'Not A Courier',
        active: true,
      },
    ],
  });
  await prisma.roleAssignment.createMany({
    data: [
      { id: randomUUID(), userId: availableCourierId, role: 'COURIER' },
      { id: randomUUID(), userId: busyCourierId, role: 'COURIER' },
      { id: randomUUID(), userId: inactiveCourierId, role: 'COURIER' },
      { id: randomUUID(), userId: nonCourierId, role: 'CUSTOMER' },
    ],
  });

  await createOrderWithCycles(prisma, {
    orderId: eligibleOrderId,
    orderStatus: 'FULFILLED',
    orderVersion: 6,
    paymentStatus: 'CONFIRMED',
    deliveryStatus: 'DELIVERED',
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
  });
  await createOrderWithCycles(prisma, {
    orderId: badPaymentOrderId,
    orderStatus: 'FULFILLED',
    orderVersion: 6,
    paymentStatus: 'PENDING',
    deliveryStatus: 'DELIVERED',
  });
  await createOrderWithCycles(prisma, {
    orderId: badDeliveryOrderId,
    orderStatus: 'FULFILLED',
    orderVersion: 6,
    paymentStatus: 'CONFIRMED',
    deliveryStatus: 'ARRIVED',
  });
  const busyDeliveryId = await createOrderWithCycles(prisma, {
    orderId: activeAssignmentOrderId,
    orderStatus: 'FULFILLED',
    orderVersion: 6,
    paymentStatus: 'CONFIRMED',
    deliveryStatus: 'DELIVERED',
  });
  await prisma.courierAssignment.create({
    data: {
      id: randomUUID(),
      deliveryId: busyDeliveryId,
      courierId: busyCourierId,
      active: true,
    },
  });
  await createOrderWithCycles(prisma, {
    orderId: readyOrderId,
    orderStatus: 'READY',
    orderVersion: 5,
    paymentStatus: 'CONFIRMED',
    deliveryStatus: 'DELIVERED',
  });

  await context.test('non-operations actors cannot use discovery endpoints', async () => {
    for (const actorId of [CUSTOMER_ID, MERCHANT_OPERATOR_ID, COURIER_ID]) {
      for (const path of [
        '/operations/couriers/available',
        '/operations/orders/pending-completion',
      ]) {
        const response = await fetch(`${baseUrl}${path}`, { headers: actorHeaders(actorId) });
        assert.equal(response.status, 403);
        assert.equal((await readJson<ErrorResponse>(response)).code, 'ROLE_FORBIDDEN');
      }
    }
  });

  await context.test('available couriers excludes busy, inactive and non-courier users', async () => {
    const response = await fetch(`${baseUrl}/operations/couriers/available`, {
      headers: actorHeaders(OPERATIONS_ID),
    });
    assert.equal(response.status, 200);
    const couriers = await readJson<AvailableCourierResponse[]>(response);

    const available = couriers.find((courier) => courier.courierId === availableCourierId);
    assert.ok(available);
    assert.equal(available.displayName, 'Available Courier');
    assert.equal(Object.hasOwn(available as object, 'email'), false);
    assert.equal(couriers.some((courier) => courier.courierId === busyCourierId), false);
    assert.equal(couriers.some((courier) => courier.courierId === inactiveCourierId), false);
    assert.equal(couriers.some((courier) => courier.courierId === nonCourierId), false);
  });

  await context.test(
    'pending completion returns only orders satisfying every closing prerequisite',
    async () => {
      const response = await fetch(`${baseUrl}/operations/orders/pending-completion`, {
        headers: actorHeaders(OPERATIONS_ID),
      });
      assert.equal(response.status, 200);
      const orders = await readJson<PendingCompletionOrderResponse[]>(response);

      assert.equal(orders[0]?.orderId, eligibleOrderId);
      const eligible = orders.find((order) => order.orderId === eligibleOrderId);
      assert.ok(eligible);
      assert.equal(eligible.version, 6);
      assert.equal(eligible.branch.id, BRANCH_ID);
      assert.equal(eligible.paymentStatus, 'CONFIRMED');
      assert.equal(eligible.deliveryStatus, 'DELIVERED');

      for (const hiddenId of [
        badPaymentOrderId,
        badDeliveryOrderId,
        activeAssignmentOrderId,
        readyOrderId,
      ]) {
        assert.equal(orders.some((order) => order.orderId === hiddenId), false);
      }
    },
  );
});

async function createOrderWithCycles(
  prisma: PrismaClient,
  input: {
    readonly orderId: string;
    readonly orderStatus: 'FULFILLED' | 'READY';
    readonly orderVersion: number;
    readonly paymentStatus: 'PENDING' | 'CONFIRMED';
    readonly deliveryStatus: 'ARRIVED' | 'DELIVERED';
    readonly createdAt?: Date;
  },
): Promise<string> {
  const deliveryId = randomUUID();
  await prisma.order.create({
    data: {
      id: input.orderId,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      status: input.orderStatus,
      version: input.orderVersion,
      totalCents: 500,
      currency: 'ARS',
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
      payment: {
        create: {
          id: randomUUID(),
          method: 'CASH',
          status: input.paymentStatus,
          amountCents: 500,
          version: input.paymentStatus === 'CONFIRMED' ? 2 : 1,
        },
      },
      delivery: {
        create: {
          id: deliveryId,
          status: input.deliveryStatus,
          version: input.deliveryStatus === 'DELIVERED' ? 7 : 6,
          expectedCashCents: 500,
          pinHash: 'test-only-pin-hash',
        },
      },
    },
  });
  return deliveryId;
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
