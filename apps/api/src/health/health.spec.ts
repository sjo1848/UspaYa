import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHealthSnapshot } from './health';

test('creates a deterministic API health snapshot', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');

  assert.deepEqual(createHealthSnapshot('ok', now), {
    service: 'api',
    status: 'ok',
    database: 'ok',
    timestamp: '2026-08-06T00:00:00.000Z',
  });
});

test('reports an unavailable database without claiming the API is healthy', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');

  assert.deepEqual(createHealthSnapshot('unavailable', now), {
    service: 'api',
    status: 'unavailable',
    database: 'unavailable',
    timestamp: '2026-08-06T00:00:00.000Z',
  });
});
