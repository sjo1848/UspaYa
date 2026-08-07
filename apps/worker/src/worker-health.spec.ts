import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWorkerHealthSnapshot } from './worker-health';

test('creates a deterministic worker health snapshot', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');

  assert.deepEqual(createWorkerHealthSnapshot(now), {
    service: 'worker',
    status: 'ready',
    broker: 'not-configured',
    timestamp: '2026-08-06T00:00:00.000Z',
  });
});
