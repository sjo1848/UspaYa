import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { createWorkerHealthSnapshot } from './worker-health';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });

  Logger.log(JSON.stringify(createWorkerHealthSnapshot()), 'WorkerBootstrap');
  await app.close();
}

void bootstrap();
