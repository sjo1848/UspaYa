import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

export interface OutboxBatchResult {
  readonly scanned: number;
  readonly claimed: number;
  readonly recovered: number;
  readonly processed: number;
  readonly failed: number;
}

export async function processOutboxBatch(
  prisma: PrismaClient,
  consumerName: string,
  batchSize = 25,
  lockTimeoutMs = 5 * 60 * 1000,
): Promise<OutboxBatchResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('Outbox batch size must be a positive integer.');
  }
  if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1) {
    throw new RangeError('Outbox lock timeout must be a positive integer.');
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - lockTimeoutMs);

  // Recovery has priority over new work. Without this separation, a continuous
  // backlog of PENDING events can keep an abandoned PROCESSING lock outside every
  // bounded batch and prevent it from ever being retried.
  const staleCandidates = await prisma.outboxEvent.findMany({
    where: {
      status: 'PROCESSING',
      lockedAt: { lte: staleBefore },
    },
    orderBy: [{ lockedAt: 'asc' }, { createdAt: 'asc' }],
    take: batchSize,
  });

  const remainingSlots = batchSize - staleCandidates.length;
  const readyCandidates =
    remainingSlots === 0
      ? []
      : await prisma.outboxEvent.findMany({
          where: {
            status: { in: ['PENDING', 'FAILED'] },
            availableAt: { lte: now },
          },
          orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
          take: remainingSlots,
        });

  const candidates = [...staleCandidates, ...readyCandidates];
  let claimed = 0;
  let recovered = 0;
  let processed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const wasStale = candidate.status === 'PROCESSING';
    if (wasStale && candidate.lockedAt === null) {
      continue;
    }

    const claim = await prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        attempts: candidate.attempts,
        ...(wasStale ? { lockedAt: candidate.lockedAt } : {}),
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lockedAt: new Date(),
      },
    });

    if (claim.count !== 1) {
      continue;
    }

    claimed += 1;
    if (wasStale) {
      recovered += 1;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.outboxConsumerReceipt.upsert({
          where: {
            consumerName_eventId: {
              consumerName,
              eventId: candidate.id,
            },
          },
          update: {},
          create: {
            id: randomUUID(),
            consumerName,
            eventId: candidate.id,
          },
        });

        await tx.outboxEvent.update({
          where: { id: candidate.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            lockedAt: null,
            lastError: null,
          },
        });
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      await prisma.outboxEvent.update({
        where: { id: candidate.id },
        data: {
          status: 'FAILED',
          lockedAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
          availableAt: new Date(Date.now() + 30_000),
        },
      });
    }
  }

  return { scanned: candidates.length, claimed, recovered, processed, failed };
}
