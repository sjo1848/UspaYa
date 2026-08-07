import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestHash } from './idempotency';

test('creates the same hash for objects with different key order', () => {
  assert.equal(createRequestHash({ b: 2, a: 1 }), createRequestHash({ a: 1, b: 2 }));
});

test('creates different hashes for different requests', () => {
  assert.notEqual(createRequestHash({ quantity: 1 }), createRequestHash({ quantity: 2 }));
});
