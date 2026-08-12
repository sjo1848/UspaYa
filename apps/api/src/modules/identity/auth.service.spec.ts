import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiError } from '../../shared/http/api-error';
import { AuthService } from './auth.service';

describe('AuthService login throttle', () => {
  it('rejects an exhausted source before attempting credential verification', async () => {
    const service = new AuthService({
      client: {
        authLoginThrottle: {
          findUnique: async () => ({ attempts: 10, windowStartedAt: new Date() }),
        },
      },
    } as never);

    await assert.rejects(
      service.login('person@example.test', 'a password that is long enough', '203.0.113.8'),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.getStatus(), 429);
        assert.deepEqual(error.getResponse(), {
          code: 'LOGIN_RATE_LIMITED',
          message: 'Too many login attempts. Try again later.',
        });
        return true;
      },
    );
  });
});
