import { readFileSync } from 'node:fs';
import { getPrismaClient } from '@uspaya/database';

import { hashPassword } from '../modules/identity/auth-crypto';

function readEmail(argumentsList: readonly string[]): string {
  const emailIndex = argumentsList.indexOf('--email');
  const email = emailIndex === -1 ? undefined : argumentsList[emailIndex + 1];
  if (email === undefined || !email.includes('@')) {
    throw new Error('Usage: bootstrap:auth-user -- --email user@example.com < password-from-stdin');
  }
  return email.trim().toLowerCase();
}

async function main(): Promise<void> {
  const email = readEmail(process.argv.slice(2));
  const password = readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
  if (password.length < 12) {
    throw new Error(
      'The password provided through standard input must contain at least 12 characters.',
    );
  }

  const prisma = getPrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({ where: { email } });
      if (existing === null) {
        throw new Error(
          'The user must exist and have assigned roles before credentials are provisioned.',
        );
      }
      const now = new Date();
      await transaction.authSession.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return transaction.user.update({
        where: { id: existing.id },
        data: { passwordHash, authVersion: { increment: 1 } },
        select: { email: true },
      });
    });
    console.log(`Credentials provisioned for ${user.email}. Existing sessions were revoked.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Credential provisioning failed.');
  process.exitCode = 1;
});
