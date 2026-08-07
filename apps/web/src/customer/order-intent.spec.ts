import { describe, expect, it } from 'vitest';

import { createCustomerOrderIntent } from './order-intent';

describe('createCustomerOrderIntent', () => {
  it('freezes one logical intent with stable generated identifiers and PIN only in memory', () => {
    const ids = ['item-1', 'intent-1', 'order-1', 'delivery-1', 'payment-1'];
    let index = 0;
    const intent = createCustomerOrderIntent(
      'branch-1',
      [{ productId: 'product-1', quantity: 2 }],
      '4826',
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
        items: [{ itemId: 'item-1', productId: 'product-1', quantity: 2 }],
      },
    });
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.request)).toBe(true);
    expect(Object.isFrozen(intent.request.items)).toBe(true);
  });

  it('rejects invalid PIN, duplicate products and out-of-range quantities', () => {
    expect(() =>
      createCustomerOrderIntent('branch', [{ productId: 'p1', quantity: 1 }], '12ab'),
    ).toThrow(/PIN/);
    expect(() =>
      createCustomerOrderIntent(
        'branch',
        [
          { productId: 'p1', quantity: 1 },
          { productId: 'p1', quantity: 2 },
        ],
        '4826',
      ),
    ).toThrow(/consolidated/);
    expect(() =>
      createCustomerOrderIntent('branch', [{ productId: 'p1', quantity: 100 }], '4826'),
    ).toThrow(/1 and 99/);
  });
});
