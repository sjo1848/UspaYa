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

interface ErrorResponse {
  readonly code: string;
}

interface CustomerActiveOrderResponse {
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

test('customer active order read model is scoped, minimal and recoverable', async (context) => {
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

  const activeOrderId = randomUUID();
  const activeDeliveryId = randomUUID();
  const activePaymentId = randomUUID();
  const olderActiveOrderId = randomUUID();
  const terminalOrderIds = [randomUUID(), randomUUID(), randomUUID()] as const;
  const foreignCustomerId = randomUUID();
  const foreignOrderId = randomUUID();
  const destinationAddress = 'Dirección privada de prueba 123';
  const destinationPhone = '+54 9 261 555 9090';
  const pinHash = 'scrypt$must-never-leak';

  context.after(async () => {
    await prisma.order.deleteMany({
      where: {
        id: {
          in: [activeOrderId, olderActiveOrderId, ...terminalOrderIds, foreignOrderId],
        },
      },
    });
    await prisma.roleAssignment.deleteMany({ where: { userId: foreignCustomerId } });
    await prisma.user.deleteMany({ where: { id: foreignCustomerId } });
    await app.close();
    restoreEnvironment('NODE_ENV', originalNodeEnv);
    restoreEnvironment('DEV_IDENTITY_ENABLED', originalDevIdentity);
  });

  await prisma.user.create({
    data: {
      id: foreignCustomerId,
      email: `customer-recovery-${foreignCustomerId}@example.test`,
      displayName: 'Foreign recovery customer',
      active: true,
    },
  });
  await prisma.roleAssignment.create({
    data: {
      id: randomUUID(),
      userId: foreignCustomerId,
      role: 'CUSTOMER',
    },
  });

  await prisma.order.create({
    data: {
      id: olderActiveOrderId,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      status: 'PENDING_MERCHANT',
      version: 2,
      totalCents: 1200,
      currency: 'ARS',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    },
  });

  await prisma.order.create({
    data: {
      id: activeOrderId,
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      status: 'READY',
      version: 5,
      totalCents: 450000,
      currency: 'ARS',
      createdAt: new Date('2026-01-02T12:00:00.000Z'),
      payment: {
        create: {
          id: activePaymentId,
          method: 'CASH',
          status: 'PENDING',
          amountCents: 450000,
          version: 1,
        },
      },
      delivery: {
        create: {
          id: activeDeliveryId,
          status: 'PENDING_ASSIGNMENT',
          version: 1,
          expectedCashCents: 450000,
          pinHash,
          destinationAddressText: destinationAddress,
          destinationPhone,
          destinationReference: 'Referencia privada',
        },
      },
    },
  });

  for (const [index, status] of ['COMPLETED', 'CANCELLED', 'REJECTED'].entries()) {
    await prisma.order.create({
      data: {
        id: terminalOrderIds[index]!,
        branchId: BRANCH_ID,
        customerId: CUSTOMER_ID,
        status: status as 'COMPLETED' | 'CANCELLED' | 'REJECTED',
        version: 7,
        totalCents: 100 + index,
        currency: 'ARS',
        createdAt: new Date(`2026-01-0${index + 3}T12:00:00.000Z`),
      },
    });
  }

  await prisma.order.create({
    data: {
      id: foreignOrderId,
      branchId: BRANCH_ID,
      customerId: foreignCustomerId,
      status: 'PREPARING',
      version: 4,
      totalCents: 9999,
      currency: 'ARS',
    },
  });

  await context.test('only customers may query the active-order read model', async () => {
    for (const actorId of [MERCHANT_OPERATOR_ID, OPERATIONS_ID, COURIER_ID]) {
      const response = await fetch(`${baseUrl}/customer/orders/active`, {
        headers: actorHeaders(actorId),
      });
      assert.equal(response.status, 403);
      assert.equal((await readJson<ErrorResponse>(response)).code, 'ROLE_FORBIDDEN');
    }
  });

  await context.test('customer sees only owned non-terminal orders in stable order', async () => {
    const response = await fetch(`${baseUrl}/customer/orders/active`, {
      headers: actorHeaders(CUSTOMER_ID),
    });
    assert.equal(response.status, 200);
    const orders = await readJson<CustomerActiveOrderResponse[]>(response);

    const activeIndex = orders.findIndex((order) => order.orderId === activeOrderId);
    const olderIndex = orders.findIndex((order) => order.orderId === olderActiveOrderId);
    assert.ok(activeIndex >= 0);
    assert.ok(olderIndex >= 0);
    assert.ok(activeIndex < olderIndex);

    const active = orders[activeIndex]!;
    assert.equal(active.branch.id, BRANCH_ID);
    assert.equal(active.status, 'READY');
    assert.equal(active.paymentStatus, 'PENDING');
    assert.equal(active.deliveryStatus, 'PENDING_ASSIGNMENT');

    for (const terminalOrderId of terminalOrderIds) {
      assert.equal(
        orders.some((order) => order.orderId === terminalOrderId),
        false,
      );
    }
    assert.equal(
      orders.some((order) => order.orderId === foreignOrderId),
      false,
    );

    const serialized = JSON.stringify(orders);
    assert.equal(serialized.includes(destinationAddress), false);
    assert.equal(serialized.includes(destinationPhone), false);
    assert.equal(serialized.includes(pinHash), false);
    assert.equal(serialized.includes('destination'), false);
    assert.equal(serialized.includes('pin'), false);
  });

  await context.test('another customer cannot discover the first customer orders', async () => {
    const response = await fetch(`${baseUrl}/customer/orders/active`, {
      headers: actorHeaders(foreignCustomerId),
    });
    assert.equal(response.status, 200);
    const orders = await readJson<CustomerActiveOrderResponse[]>(response);

    assert.equal(
      orders.some((order) => order.orderId === foreignOrderId),
      true,
    );
    assert.equal(
      orders.some((order) => order.orderId === activeOrderId),
      false,
    );
    assert.equal(
      orders.some((order) => order.orderId === olderActiveOrderId),
      false,
    );
  });
});

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
