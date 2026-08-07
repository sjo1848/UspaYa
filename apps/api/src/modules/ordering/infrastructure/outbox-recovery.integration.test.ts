import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { closePrismaClient, getPrismaClient, processOutboxBatch } from '@uspaya/database';

const prisma = getPrismaClient();
const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Uses synthetic aggregate identifiers because Outbox does not own the Order FK.
test('Outbox recovers a stale processing lock before pending backlog', async (context) => {
  const staleEventId = randomUUID();
  const backlogEventId = randomUUID();

  context.after(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { id: { in: [staleEventId, backlogEventId] } },
    });
    await closePrismaClient();
  });

  await prisma.outboxEvent.create({
    data: {
      id: backlogEventId,
      aggregateType: 'Order',
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      eventName: 'PendingBacklogBeforeStaleRecoveryTest',
      payload: {},
      status: 'PENDING',
      availableAt: new Date(Date.now() - 20 * 60 * 1000),
    },
  });

  await prisma.outboxEvent.create({
    data: {
      id: staleEventId,
      aggregateType: 'Order',
      aggregateId: ORDER_ID,
      aggregateVersion: 1,
      eventName: 'StaleLockRecoveryTest',
      payload: {},
      status: 'PROCESSING',
      attempts: 1,
      lockedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });

  // batchSize=1 proves stale recovery has priority even when an older PENDING
  // event would otherwise occupy the only slot in a combined candidate query.
  const result = await processOutboxBatch(prisma, 'stale-lock-test', 1);
  assert.equal(result.recovered, 1);
  assert.equal(result.processed, 1);
  assert.equal(
    await prisma.outboxConsumerReceipt.count({
      where: { consumerName: 'stale-lock-test', eventId: staleEventId },
    }),
    1,
  );
  assert.equal(
    (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: staleEventId } })).status,
    'PROCESSED',
  );
  assert.equal(
    (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: backlogEventId } })).status,
    'PENDING',
  );
});
