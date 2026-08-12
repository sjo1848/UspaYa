import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeLogValue } from './structured-logger';

test('redacts secrets, tokens and database credentials from structured log values', () => {
  assert.deepEqual(
    sanitizeLogValue({
      authorization: 'Bearer abc.def.ghi',
      nested: { pin: '4826', safe: 'visible' },
      error: 'failed postgresql://user:password@postgres:5432/uspaya',
    }),
    {
      authorization: '[REDACTED]',
      nested: { pin: '[REDACTED]', safe: 'visible' },
      error: 'failed postgresql://user:[REDACTED]@postgres:5432/uspaya',
    },
  );
});
