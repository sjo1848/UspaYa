import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { closePrismaClient, getPrismaClient, processOutboxBatch } from '@uspaya/database';

import { createWorkerHealthSnapshot } from './worker-health';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });

  const result = await processOutboxBatch(getPrismaClient(), 'uspaya-worker');
  Logger.log(
    JSON.stringify({ ...createWorkerHealthSnapshot(), outbox: result }),
    'WorkerBootstrap',
  );
  await closePrismaClient();
  await app.close();
}

void bootstrap();
