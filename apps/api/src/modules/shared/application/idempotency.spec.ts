import assert from 'node:assert/strict';
import test from 'node:test';

import { createProtectedRequestHash, protectedRequestHashMatches } from './idempotency';

test('protected idempotency fingerprints keep low-entropy secrets out of cheap hashes', () => {
  const publicValue = { orderId: 'order-1', quantity: 2 };
  const pin = '4826';

  const first = createProtectedRequestHash(publicValue, pin);
  const second = createProtectedRequestHash(publicValue, pin);

  assert.match(first, /^scrypt-v1\$/);
  assert.match(second, /^scrypt-v1\$/);
  assert.notEqual(first, second, 'random salts must produce different stored fingerprints');
  assert.equal(first.includes(pin), false);
  assert.equal(protectedRequestHashMatches(first, publicValue, pin), true);
  assert.equal(protectedRequestHashMatches(second, publicValue, pin), true);
  assert.equal(protectedRequestHashMatches(first, publicValue, '4827'), false);
  assert.equal(protectedRequestHashMatches(first, { orderId: 'order-1', quantity: 3 }, pin), false);
  assert.equal(protectedRequestHashMatches('legacy-sha256-value', publicValue, pin), false);
});
