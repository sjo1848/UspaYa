import { describe, expect, it } from 'vitest';

import { createIdempotentIntent } from './idempotency';

describe('createIdempotentIntent', () => {
  it('creates one stable key that callers can reuse for retries of the same intent', () => {
    const intent = createIdempotentIntent(
      'submit-order',
      () => 'uuid-1',
      () => 1234,
    );

    expect(intent).toEqual({
      key: 'submit-order-uuid-1',
      createdAt: 1234,
    });
    expect(intent.key).toBe(intent.key);
    expect(Object.isFrozen(intent)).toBe(true);
  });

  it('normalizes the prefix without putting user data into the key', () => {
    const intent = createIdempotentIntent(' Confirm Delivery ', () => 'uuid-2');
    expect(intent.key).toBe('Confirm-Delivery-uuid-2');
  });

  it('rejects an unusable prefix', () => {
    expect(() => createIdempotentIntent('!')).toThrow(/prefix/i);
  });
});
