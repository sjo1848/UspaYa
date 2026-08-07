import { PrismaClient } from '@prisma/client';

let sharedClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  sharedClient ??= new PrismaClient();
  return sharedClient;
}

export async function closePrismaClient(): Promise<void> {
  if (sharedClient === undefined) {
    return;
  }

  await sharedClient.$disconnect();
  sharedClient = undefined;
}
