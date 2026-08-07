import type { SubmitOrderRequest } from '@/api/client';
import { createIdempotentIntent } from '@/api/idempotency';

export interface CartLineInput {
  readonly productId: string;
  readonly quantity: number;
}

export interface CustomerOrderIntent {
  readonly idempotencyKey: string;
  readonly request: SubmitOrderRequest;
  readonly createdAt: number;
}

export function createCustomerOrderIntent(
  branchId: string,
  cart: readonly CartLineInput[],
  deliveryPin: string,
  uuidFactory: () => string = crypto.randomUUID.bind(crypto),
  now: () => number = Date.now,
): CustomerOrderIntent {
  if (branchId.trim().length === 0) {
    throw new Error('A branch is required to submit an order.');
  }
  if (!/^\d{4,6}$/.test(deliveryPin)) {
    throw new Error('Delivery PIN must contain 4 to 6 digits.');
  }
  if (cart.length === 0) {
    throw new Error('Cart must contain at least one product.');
  }

  const uniqueProducts = new Set<string>();
  const items = cart.map((line) => {
    if (uniqueProducts.has(line.productId)) {
      throw new Error('Cart products must be consolidated before submission.');
    }
    uniqueProducts.add(line.productId);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new Error('Cart quantity must be an integer between 1 and 99.');
    }
    return Object.freeze({
      itemId: uuidFactory(),
      productId: line.productId,
      quantity: line.quantity,
    });
  });

  const intent = createIdempotentIntent('submit-order', uuidFactory, now);
  return Object.freeze({
    idempotencyKey: intent.key,
    createdAt: intent.createdAt,
    request: Object.freeze({
      orderId: uuidFactory(),
      deliveryId: uuidFactory(),
      paymentId: uuidFactory(),
      branchId,
      deliveryPin,
      items: Object.freeze(items),
    }),
  });
}
