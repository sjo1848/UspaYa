import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDevelopmentIdentityConfiguration,
  isDevelopmentIdentityEnabled,
} from './development-identity.guard';

test('development identity fails closed outside explicitly allowed environments', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnabled = process.env.DEV_IDENTITY_ENABLED;

  try {
    process.env.DEV_IDENTITY_ENABLED = 'true';
    delete process.env.NODE_ENV;
    assert.throws(() => assertDevelopmentIdentityConfiguration(), /NODE_ENV is undefined/);
    assert.equal(isDevelopmentIdentityEnabled(), false);

    process.env.NODE_ENV = 'production';
    assert.throws(() => assertDevelopmentIdentityConfiguration(), /NODE_ENV is production/);
    assert.equal(isDevelopmentIdentityEnabled(), false);

    process.env.NODE_ENV = 'test';
    assert.doesNotThrow(() => assertDevelopmentIdentityConfiguration());
    assert.equal(isDevelopmentIdentityEnabled(), true);
  } finally {
    restoreEnvironment('NODE_ENV', originalNodeEnv);
    restoreEnvironment('DEV_IDENTITY_ENABLED', originalEnabled);
  }
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
