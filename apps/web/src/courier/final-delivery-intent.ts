import type { ConfirmCourierDeliveryRequest } from '../api/client';
import { createIdempotentIntent } from '../api/idempotency';

export interface FinalDeliveryIntent {
  readonly idempotencyKey: string;
  readonly request: ConfirmCourierDeliveryRequest;
  readonly createdAt: number;
}

export function createFinalDeliveryIntent(
  expectedVersion: number,
  expectedCashCents: number,
  pin: string,
  receiver: string,
  cashReceivedCents: number,
  uuidFactory: () => string = crypto.randomUUID.bind(crypto),
  now: () => number = Date.now,
): FinalDeliveryIntent {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error('Delivery version must be a positive integer.');
  }
  if (!Number.isSafeInteger(expectedCashCents) || expectedCashCents < 0) {
    throw new Error('Expected cash amount must be a non-negative integer.');
  }
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('Delivery PIN must contain 4 to 6 digits.');
  }

  const normalizedReceiver = receiver.trim();
  if (normalizedReceiver.length === 0) {
    throw new Error('A receiver is required to confirm delivery.');
  }
  if (!Number.isSafeInteger(cashReceivedCents) || cashReceivedCents < 0) {
    throw new Error('Received cash amount must be a non-negative integer.');
  }
  if (cashReceivedCents !== expectedCashCents) {
    throw new Error('Received cash amount must match the expected amount.');
  }

  const intent = createIdempotentIntent('confirm-delivery', uuidFactory, now);
  return Object.freeze({
    idempotencyKey: intent.key,
    createdAt: intent.createdAt,
    request: Object.freeze({
      expectedVersion,
      pin,
      receiver: normalizedReceiver,
      cashReceivedCents,
    }),
  });
}
