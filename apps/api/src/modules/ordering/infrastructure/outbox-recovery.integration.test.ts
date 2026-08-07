import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  closePrismaClient,
  getPrismaClient,
  processOutboxBatch,
} from '@uspaya/database';

const prisma = getPrismaClient();
const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Uses a synthetic aggregate identifier because Outbox does not own the Order FK.
test('Outbox recovers a stale processing lock after worker failure', async (context) => {
  context.after(async () => closePrismaClient());

  const eventId = randomUUID();
  await prisma.outboxEvent.create({
    data: {
      id: eventId,
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

  const result = await processOutboxBatch(prisma, 'stale-lock-test', 25);
  assert.equal(result.recovered, 1);
  assert.equal(
    await prisma.outboxConsumerReceipt.count({
      where: { consumerName: 'stale-lock-test', eventId },
    }),
    1,
  );
  assert.equal(
    (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } })).status,
    'PROCESSED',
  );
});
