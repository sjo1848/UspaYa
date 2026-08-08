import type { SubmitOrderRequest } from '../api/client';
import { createIdempotentIntent } from '../api/idempotency';

export interface CartLineInput {
  readonly productId: string;
  readonly quantity: number;
}

export interface CustomerDeliveryDestinationInput {
  readonly addressText: string;
  readonly phone: string;
  readonly reference?: string;
  readonly lodging?: string;
  readonly latitude?: number;
  readonly longitude?: number;
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
  deliveryDestination: CustomerDeliveryDestinationInput,
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

  const destination = normalizeDestination(deliveryDestination);
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
      deliveryDestination: destination,
      items: Object.freeze(items),
    }),
  });
}

function normalizeDestination(
  input: CustomerDeliveryDestinationInput,
): SubmitOrderRequest['deliveryDestination'] {
  const addressText = input.addressText.trim();
  const phone = input.phone.trim();
  if (addressText.length < 3) {
    throw new Error('Delivery address is required.');
  }
  if (phone.length < 6) {
    throw new Error('Delivery phone is required.');
  }

  const hasLatitude = input.latitude !== undefined;
  const hasLongitude = input.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new Error('Delivery coordinates must include latitude and longitude together.');
  }
  if (
    input.latitude !== undefined &&
    (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90)
  ) {
    throw new Error('Delivery latitude is invalid.');
  }
  if (
    input.longitude !== undefined &&
    (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180)
  ) {
    throw new Error('Delivery longitude is invalid.');
  }

  const reference = input.reference?.trim();
  const lodging = input.lodging?.trim();
  return Object.freeze({
    addressText,
    phone,
    ...(reference ? { reference } : {}),
    ...(lodging ? { lodging } : {}),
    ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
    ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
  });
}
