import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { closePrismaClient, getPrismaClient, processOutboxBatch } from '@uspaya/database';

import { createWorkerHealthSnapshot } from './worker-health';
import { WorkerModule } from './worker.module';
import { StructuredLogger } from './structured-logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(new StructuredLogger());

  const result = await processOutboxBatch(getPrismaClient(), 'uspaya-worker');
  Logger.log({ ...createWorkerHealthSnapshot(), outbox: result }, 'WorkerBootstrap');
  await closePrismaClient();
  await app.close();
}

void bootstrap();
