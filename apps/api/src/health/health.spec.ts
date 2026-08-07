import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHealthSnapshot } from './health';

test('creates a deterministic API health snapshot', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');

  assert.deepEqual(createHealthSnapshot(now), {
    service: 'api',
    status: 'ok',
    timestamp: '2026-08-06T00:00:00.000Z',
  });
});
