import { describe, expect, it } from 'vitest';

import { createFinalDeliveryIntent } from './final-delivery-intent';

describe('createFinalDeliveryIntent', () => {
  it('keeps one immutable idempotency key and exact final-delivery payload', () => {
    const uuids = ['intent-uuid'];
    const intent = createFinalDeliveryIntent(
      6,
      250000,
      '4826',
      ' Cliente receptor ',
      250000,
      () => uuids.shift() ?? 'unexpected',
      () => 123456,
    );

    expect(intent).toEqual({
      idempotencyKey: 'confirm-delivery-intent-uuid',
      createdAt: 123456,
      request: {
        expectedVersion: 6,
        pin: '4826',
        receiver: 'Cliente receptor',
        cashReceivedCents: 250000,
      },
    });
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.request)).toBe(true);
  });

  it('rejects invalid PIN, receiver and cash difference before sending', () => {
    expect(() => createFinalDeliveryIntent(6, 100, '12', 'Cliente', 100)).toThrow(
      'Delivery PIN must contain 4 to 6 digits.',
    );
    expect(() => createFinalDeliveryIntent(6, 100, '4826', '   ', 100)).toThrow(
      'A receiver is required to confirm delivery.',
    );
    expect(() => createFinalDeliveryIntent(6, 100, '4826', 'Cliente', 90)).toThrow(
      'Received cash amount must match the expected amount.',
    );
  });
});
