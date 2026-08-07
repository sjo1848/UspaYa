import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const MODULES_ROOT = join(process.cwd(), 'src', 'modules');

const DOMAIN_FORBIDDEN_IMPORTS = ['@nestjs/', '@uspaya/database', '/infrastructure/', '/http/'];
const SUBMIT_ORDER_FORBIDDEN_IMPORTS = [
  '@uspaya/database',
  'PrismaClient',
  'Prisma.',
  '/infrastructure/',
];

test('domain source does not depend on framework or infrastructure', async () => {
  const files = (await collectTypeScriptFiles(MODULES_ROOT)).filter((file) => {
    const normalized = normalize(file);
    return normalized.includes('/domain/') && !normalized.endsWith('.spec.ts');
  });

  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const forbidden of DOMAIN_FORBIDDEN_IMPORTS) {
      if (source.includes(forbidden)) {
        violations.push(`${relativeModulePath(file)} imports/references ${forbidden}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('SubmitOrder application uses its persistence port instead of Prisma', async () => {
  const servicePath = join(MODULES_ROOT, 'ordering', 'application', 'submit-order.service.ts');
  const source = await readFile(servicePath, 'utf8');

  for (const forbidden of SUBMIT_ORDER_FORBIDDEN_IMPORTS) {
    assert.equal(
      source.includes(forbidden),
      false,
      `SubmitOrder application must not reference ${forbidden}`,
    );
  }
  assert.match(source, /SubmitOrderPersistencePort/);

  const controllerPath = join(MODULES_ROOT, 'ordering', 'http', 'orders.controller.ts');
  const controller = await readFile(controllerPath, 'utf8');
  assert.equal(
    controller.includes('new SubmitOrderService'),
    false,
    'HTTP adapter must receive SubmitOrderService through composition/injection.',
  );
});

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }

  return files;
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/');
}

function relativeModulePath(path: string): string {
  const normalizedRoot = normalize(MODULES_ROOT);
  return normalize(path).replace(`${normalizedRoot}/`, '');
}
