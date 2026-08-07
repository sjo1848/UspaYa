import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { closePrismaClient, getPrismaClient, processOutboxBatch } from '@uspaya/database';

import { PrismaDeliveryRepository } from '../../delivery/infrastructure/prisma-delivery.repository';
import { IdempotencyConflictError } from '../../shared/application/idempotency';
import {
  ActiveCourierAssignmentConflictError,
  PersistenceConflictError,
} from '../../shared/infrastructure/persistence-errors';
import { SubmitOrderService, type SubmitOrderHooks } from '../application/submit-order.service';
import { PrismaOrderRepository } from './prisma-order.repository';
import { PrismaSubmitOrderPersistence } from './prisma-submit-order.persistence';

const prisma = getPrismaClient();
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const COURIER_ID = '44444444-4444-4444-8444-444444444444';

function command(suffix: string) {
  return {
    idempotencyKey: `integration-${suffix}`,
    orderId: randomUUID(),
    deliveryId: randomUUID(),
    paymentId: randomUUID(),
    customerId: CUSTOMER_ID,
    branchId: BRANCH_ID,
    plainTextPin: '4826',
    items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 2 }],
  } as const;
}

function createSubmitOrderService(hooks: SubmitOrderHooks = {}): SubmitOrderService {
  return new SubmitOrderService(new PrismaSubmitOrderPersistence(prisma), hooks);
}

test('Phase 2 persistence invariants', async (context) => {
  context.after(async () => closePrismaClient());

  await context.test('seeds create deterministic pilot actors and products', async () => {
    assert.equal(await prisma.user.count({ where: { id: CUSTOMER_ID } }), 1);
    assert.equal(await prisma.product.count({ where: { id: PRODUCT_ID } }), 1);
  });

  await context.test('mutation, audit, idempotency and Outbox roll back together', async () => {
    const input = command(`rollback-${randomUUID()}`);
    const service = createSubmitOrderService({
      afterOrderPersisted: () => {
        throw new Error('Injected failure');
      },
    });
    await assert.rejects(service.execute(input), /Injected failure/);
    assert.equal(await prisma.order.count({ where: { id: input.orderId } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { aggregateId: input.orderId } }), 0);
    assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: input.orderId } }), 0);
    assert.equal(
      await prisma.idempotencyRecord.count({
        where: { scope: 'SubmitOrder', key: input.idempotencyKey },
      }),
      0,
    );
  });

  const first = command(`idempotency-${randomUUID()}`);
  const service = createSubmitOrderService();
  const firstResult = await service.execute(first);

  await context.test('same key and request recover the stored result', async () => {
    const repeated = await service.execute(first);
    assert.deepEqual(repeated, firstResult);
    assert.equal(await prisma.order.count({ where: { id: first.orderId } }), 1);
  });

  await context.test('same key with different request is rejected', async () => {
    await assert.rejects(
      service.execute({
        ...first,
        items: [{ ...first.items[0], quantity: 3 }],
      }),
      IdempotencyConflictError,
    );
  });

  await context.test('same key with different PIN is rejected and PIN fingerprint is protected', async () => {
    const stored = await prisma.idempotencyRecord.findUniqueOrThrow({
      where: {
        scope_key: {
          scope: 'SubmitOrder',
          key: first.idempotencyKey,
        },
      },
    });

    assert.match(stored.requestHash, /^scrypt-v1\$/);
    assert.equal(stored.requestHash.includes(first.plainTextPin), false);
    await assert.rejects(
      service.execute({
        ...first,
        plainTextPin: '4827',
      }),
      IdempotencyConflictError,
    );
  });

  await context.test('optimistic version prevents stale order writes', async () => {
    const repository = new PrismaOrderRepository(prisma);
    const copyA = await repository.findById(first.orderId);
    const copyB = await repository.findById(first.orderId);
    assert.ok(copyA);
    assert.ok(copyB);
    const persistedVersion = copyA.version;
    copyA.accept(BRANCH_ID, copyA.version);
    copyB.accept(BRANCH_ID, copyB.version);
    await repository.save(copyA, persistedVersion);
    await assert.rejects(repository.save(copyB, persistedVersion), PersistenceConflictError);
  });

  await context.test('database prevents two active deliveries for one courier', async () => {
    const second = command(`assignment-${randomUUID()}`);
    await service.execute(second);
    const repository = new PrismaDeliveryRepository(prisma);
    const firstDelivery = await repository.findById(first.deliveryId);
    const secondDelivery = await repository.findById(second.deliveryId);
    assert.ok(firstDelivery);
    assert.ok(secondDelivery);
    firstDelivery.assignCourier(COURIER_ID, firstDelivery.version);
    await repository.save(firstDelivery, 1);
    secondDelivery.assignCourier(COURIER_ID, secondDelivery.version);
    await assert.rejects(repository.save(secondDelivery, 1), ActiveCourierAssignmentConflictError);
  });

  await context.test('audit log rejects update and deletion', async () => {
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { aggregateId: first.orderId },
    });
    await assert.rejects(
      prisma.$executeRawUnsafe(
        'UPDATE "AuditLog" SET "action" = $1 WHERE "id" = $2::uuid',
        'x',
        audit.id,
      ),
      /append-only/,
    );
    await assert.rejects(
      prisma.$executeRawUnsafe('DELETE FROM "AuditLog" WHERE "id" = $1::uuid', audit.id),
      /append-only/,
    );
  });

  await context.test('Outbox reprocessing does not duplicate consumer effects', async () => {
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: first.orderId },
    });
    const priorityTime = new Date(0);

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PENDING', processedAt: null, availableAt: priorityTime },
    });
    await processOutboxBatch(prisma, 'integration-consumer', 1);
    assert.equal(
      await prisma.outboxConsumerReceipt.count({
        where: { consumerName: 'integration-consumer', eventId: event.id },
      }),
      1,
    );

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PENDING', processedAt: null, availableAt: priorityTime },
    });
    await processOutboxBatch(prisma, 'integration-consumer', 1);
    assert.equal(
      await prisma.outboxConsumerReceipt.count({
        where: { consumerName: 'integration-consumer', eventId: event.id },
      }),
      1,
    );
    assert.equal(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status,
      'PROCESSED',
    );
  });
});
