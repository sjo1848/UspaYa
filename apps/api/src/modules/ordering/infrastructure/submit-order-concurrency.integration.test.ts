import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { closePrismaClient, getPrismaClient, IdempotencyConflictError } from '@uspaya/database';

import { SubmitOrderService } from '../application/submit-order.service';

const prisma = getPrismaClient();
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

function command(key: string) {
  return {
    idempotencyKey: key,
    orderId: randomUUID(),
    deliveryId: randomUUID(),
    paymentId: randomUUID(),
    customerId: CUSTOMER_ID,
    branchId: BRANCH_ID,
    plainTextPin: '4826',
    items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 1 }],
  } as const;
}

test('concurrent SubmitOrder retries with the same request return one result', async (context) => {
  context.after(async () => closePrismaClient());

  const input = command(`concurrent-same-${randomUUID()}`);
  const service = new SubmitOrderService(prisma);
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
    new SubmitOrderService(prisma).execute(input),
    new SubmitOrderService(prisma).execute({
      ...input,
      items: [{ ...input.items[0], quantity: 2 }],
    }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof IdempotencyConflictError);
});
