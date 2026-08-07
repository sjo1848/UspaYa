export interface IdempotentIntent {
  readonly key: string;
  readonly createdAt: number;
}

export function createIdempotentIntent(
  prefix: string,
  uuidFactory: () => string = crypto.randomUUID.bind(crypto),
  now: () => number = Date.now,
): IdempotentIntent {
  const normalizedPrefix = prefix
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  if (normalizedPrefix.length < 2) {
    throw new Error('Idempotency intent prefix must contain at least two safe characters.');
  }

  return Object.freeze({
    key: `${normalizedPrefix}-${uuidFactory()}`,
    createdAt: now(),
  });
}
