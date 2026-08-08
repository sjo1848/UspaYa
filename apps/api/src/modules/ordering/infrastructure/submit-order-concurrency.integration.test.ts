import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { closePrismaClient, getPrismaClient } from '@uspaya/database';

import { IdempotencyConflictError } from '../../shared/application/idempotency';
import { SubmitOrderService } from '../application/submit-order.service';
import { PrismaSubmitOrderPersistence } from './prisma-submit-order.persistence';

const prisma = getPrismaClient();
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const DESTINATION = {
  addressText: 'Av. Las Heras 120, Uspallata',
  phone: '+54 9 261 555 0101',
} as const;

function command(key: string) {
  return {
    idempotencyKey: key,
    orderId: randomUUID(),
    deliveryId: randomUUID(),
    paymentId: randomUUID(),
    customerId: CUSTOMER_ID,
    branchId: BRANCH_ID,
    plainTextPin: '4826',
    deliveryDestination: DESTINATION,
    items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 1 }],
  } as const;
}

function createService(): SubmitOrderService {
  return new SubmitOrderService(new PrismaSubmitOrderPersistence(prisma));
}

test('concurrent SubmitOrder retries with the same request return one result', async (context) => {
  context.after(async () => closePrismaClient());

  const input = command(`concurrent-same-${randomUUID()}`);
  const service = createService();
  const [first, second] = await Promise.all([service.execute(input), service.execute(input)]);

  assert.deepEqual(second, first);
  assert.equal(await prisma.order.count({ where: { id: input.orderId } }), 1);
  assert.equal(
    await prisma.idempotencyRecord.count({
      where: { scope: 'SubmitOrder', key: input.idempotencyKey, status: 'COMPLETED' },
    }),
    1,
  );
});

test('concurrent reuse of one key with different requests returns a deterministic conflict', async () => {
  const input = command(`concurrent-conflict-${randomUUID()}`);
  const results = await Promise.allSettled([
    createService().execute(input),
    createService().execute({
      ...input,
      items: [{ ...input.items[0], quantity: 2 }],
    }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof IdempotencyConflictError);
});
