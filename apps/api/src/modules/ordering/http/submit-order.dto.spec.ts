import assert from 'node:assert/strict';
import test from 'node:test';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SubmitOrderDto } from './submit-order.dto';

const UUIDS = {
  order: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  delivery: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  payment: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  branch: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  item: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  productA: '11111111-1111-4111-8111-111111111111',
  productB: '22222222-2222-4222-8222-222222222222',
} as const;

test('submit-order DTO rejects duplicate client-generated item identifiers', async () => {
  const dto = plainToInstance(SubmitOrderDto, {
    orderId: UUIDS.order,
    deliveryId: UUIDS.delivery,
    paymentId: UUIDS.payment,
    branchId: UUIDS.branch,
    deliveryPin: '4826',
    items: [
      { itemId: UUIDS.item, productId: UUIDS.productA, quantity: 1 },
      { itemId: UUIDS.item, productId: UUIDS.productB, quantity: 1 },
    ],
  });

  const errors = await validate(dto);
  const itemsError = errors.find((error) => error.property === 'items');

  assert.ok(itemsError);
  assert.equal(typeof itemsError.constraints?.arrayUnique, 'string');
});
