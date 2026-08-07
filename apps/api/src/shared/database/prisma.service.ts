import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { closePrismaClient, getPrismaClient, type PrismaClient } from '@uspaya/database';

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  readonly client: PrismaClient = getPrismaClient();

  async onApplicationShutdown(): Promise<void> {
    await closePrismaClient();
  }
}
