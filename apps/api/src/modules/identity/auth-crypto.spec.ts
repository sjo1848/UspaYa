import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  hashPassword,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from './auth-crypto';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('internal authentication crypto', () => {
  it('hashes passwords with a salted verifier', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');

    assert.notEqual(first, second);
    assert.equal(await verifyPassword('correct horse battery staple', first), true);
    assert.equal(await verifyPassword('wrong password', first), false);
  });

  it('hashes refresh tokens without storing the token itself', () => {
    assert.equal(hashRefreshToken('refresh-token').length, 64);
    assert.equal(hashRefreshToken('refresh-token'), hashRefreshToken('refresh-token'));
    assert.notEqual(hashRefreshToken('refresh-token'), 'refresh-token');
  });

  it('signs and verifies access tokens with the required claims', async () => {
    process.env.AUTH_JWT_SECRET = 'local-test-secret-with-more-than-32-bytes';
    process.env.AUTH_JWT_ISSUER = 'uspaya-test';
    process.env.AUTH_JWT_AUDIENCE = 'uspaya-test-web';

    const token = await signAccessToken({ sub: 'user-1', sid: 'session-1', ver: 0 });
    await assert.doesNotReject(async () => {
      assert.deepEqual(await verifyAccessToken(token), {
        sub: 'user-1',
        sid: 'session-1',
        ver: 0,
      });
    });

    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    await assert.rejects(verifyAccessToken(tampered));
  });
});
