import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

export interface OutboxBatchResult {
  readonly scanned: number;
  readonly claimed: number;
  readonly processed: number;
  readonly failed: number;
}

export async function processOutboxBatch(
  prisma: PrismaClient,
  consumerName: string,
  batchSize = 25,
): Promise<OutboxBatchResult> {
  const candidates = await prisma.outboxEvent.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      availableAt: { lte: new Date() },
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: batchSize,
  });

  let claimed = 0;
  let processed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claim = await prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        attempts: candidate.attempts,
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

  return { scanned: candidates.length, claimed, processed, failed };
}
