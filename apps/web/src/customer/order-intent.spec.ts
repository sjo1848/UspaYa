import { describe, expect, it } from 'vitest';

import { createCustomerOrderIntent } from './order-intent';

const destination = {
  addressText: 'Av. Las Heras 120',
  phone: '+54 9 261 555 0101',
  reference: 'Portón azul',
};

describe('createCustomerOrderIntent', () => {
  it('freezes one logical intent with destination, stable identifiers and PIN only in memory', () => {
    const ids = ['item-1', 'intent-1', 'order-1', 'delivery-1', 'payment-1'];
    let index = 0;
    const intent = createCustomerOrderIntent(
      'branch-1',
      [{ productId: 'product-1', quantity: 2 }],
      '4826',
      destination,
      () => ids[index++] ?? 'unexpected',
      () => 1234,
    );

    expect(intent).toEqual({
      idempotencyKey: 'submit-order-intent-1',
      createdAt: 1234,
      request: {
        orderId: 'order-1',
        deliveryId: 'delivery-1',
        paymentId: 'payment-1',
        branchId: 'branch-1',
        deliveryPin: '4826',
        deliveryDestination: destination,
        items: [{ itemId: 'item-1', productId: 'product-1', quantity: 2 }],
      },
    });
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.request)).toBe(true);
    expect(Object.isFrozen(intent.request.deliveryDestination)).toBe(true);
    expect(Object.isFrozen(intent.request.items)).toBe(true);
  });

  it('rejects invalid PIN, destination, duplicate products and out-of-range quantities', () => {
    expect(() =>
      createCustomerOrderIntent('branch', [{ productId: 'p1', quantity: 1 }], '12ab', destination),
    ).toThrow(/PIN/);
    expect(() =>
      createCustomerOrderIntent('branch', [{ productId: 'p1', quantity: 1 }], '4826', {
        addressText: ' ',
        phone: '123456',
      }),
    ).toThrow(/address/);
    expect(() =>
      createCustomerOrderIntent(
        'branch',
        [
          { productId: 'p1', quantity: 1 },
          { productId: 'p1', quantity: 2 },
        ],
        '4826',
        destination,
      ),
    ).toThrow(/consolidated/);
    expect(() =>
      createCustomerOrderIntent(
        'branch',
        [{ productId: 'p1', quantity: 100 }],
        '4826',
        destination,
      ),
    ).toThrow(/1 and 99/);
  });

  it('keeps destination data out of browser storage by construction', () => {
    const intent = createCustomerOrderIntent(
      'branch',
      [{ productId: 'p1', quantity: 1 }],
      '4826',
      { ...destination, lodging: 'Hostería Uspallata' },
    );

    expect(intent.request.deliveryDestination.addressText).toBe(destination.addressText);
    expect(intent.request.deliveryDestination.phone).toBe(destination.phone);
    expect(intent.request.deliveryDestination.lodging).toBe('Hostería Uspallata');
  });
});
