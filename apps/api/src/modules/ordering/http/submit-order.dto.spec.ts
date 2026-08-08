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

function validBody() {
  return {
    orderId: UUIDS.order,
    deliveryId: UUIDS.delivery,
    paymentId: UUIDS.payment,
    branchId: UUIDS.branch,
    deliveryPin: '4826',
    deliveryDestination: {
      addressText: 'Av. Las Heras 120, Uspallata',
      phone: '+54 9 261 555 0101',
      reference: 'Portón azul',
    },
    items: [{ itemId: UUIDS.item, productId: UUIDS.productA, quantity: 1 }],
  };
}

test('submit-order DTO rejects duplicate client-generated item identifiers', async () => {
  const dto = plainToInstance(SubmitOrderDto, {
    ...validBody(),
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

test('submit-order DTO requires a delivery destination', async () => {
  const { deliveryDestination: _omitted, ...body } = validBody();
  const dto = plainToInstance(SubmitOrderDto, body);

  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === 'deliveryDestination'));
});

test('submit-order DTO rejects partial delivery coordinates', async () => {
  const dto = plainToInstance(SubmitOrderDto, {
    ...validBody(),
    deliveryDestination: {
      ...validBody().deliveryDestination,
      latitude: -32.59,
    },
  });

  const errors = await validate(dto);
  const destinationError = errors.find((error) => error.property === 'deliveryDestination');

  assert.ok(destinationError);
  assert.ok(destinationError.children?.some((error) => error.property === 'longitude'));
});

test('submit-order DTO accepts paired coordinates in range', async () => {
  const dto = plainToInstance(SubmitOrderDto, {
    ...validBody(),
    deliveryDestination: {
      ...validBody().deliveryDestination,
      latitude: -32.593,
      longitude: -69.349,
    },
  });

  assert.deepEqual(await validate(dto), []);
});
