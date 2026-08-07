import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const FINGERPRINT_PREFIX = 'scrypt-v1';
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const PROTECTED_HASH_PATTERN = /^scrypt-v1\$([a-f0-9]{64})\$([a-f0-9]{32})\$([a-f0-9]{64})$/i;

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';

  constructor() {
    super('Idempotency key was already used with a different request.');
    this.name = 'IdempotencyConflictError';
  }
}

export function createRequestHash(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

export function createProtectedRequestHash(publicValue: unknown, secret: string): string {
  const publicHash = createRequestHash(publicValue);
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = scryptSync(secret, salt, DERIVED_KEY_BYTES);
  return `${FINGERPRINT_PREFIX}$${publicHash}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export function protectedRequestHashMatches(
  storedHash: string,
  publicValue: unknown,
  secret: string,
): boolean {
  const match = PROTECTED_HASH_PATTERN.exec(storedHash);
  const storedPublicHash = match?.[1];
  const saltHex = match?.[2];
  const derivedKeyHex = match?.[3];
  if (storedPublicHash === undefined || saltHex === undefined || derivedKeyHex === undefined) {
    return false;
  }
  if (storedPublicHash !== createRequestHash(publicValue)) {
    return false;
  }
  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(derivedKeyHex, 'hex');
  const candidateKey = scryptSync(secret, salt, DERIVED_KEY_BYTES);
  return timingSafeEqual(expectedKey, candidateKey);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}
