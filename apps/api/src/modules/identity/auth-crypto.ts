import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_COST = 32_768;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;

export interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly ver: number;
}

export function randomRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePasswordKey(password, salt, PASSWORD_KEY_LENGTH);
  return [
    'scrypt',
    PASSWORD_COST,
    PASSWORD_BLOCK_SIZE,
    PASSWORD_PARALLELIZATION,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltEncoded, hashEncoded] =
    encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== String(PASSWORD_COST) ||
    blockSize !== String(PASSWORD_BLOCK_SIZE) ||
    parallelization !== String(PASSWORD_PARALLELIZATION) ||
    saltEncoded === undefined ||
    hashEncoded === undefined
  ) {
    return false;
  }

  const expected = Buffer.from(hashEncoded, 'base64url');
  const actual = await derivePasswordKey(
    password,
    Buffer.from(saltEncoded, 'base64url'),
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function jwtConfig(): { secret: Uint8Array; issuer: string; audience: string; ttl: number } {
  const secret = process.env.AUTH_JWT_SECRET;
  if (secret === undefined || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_JWT_SECRET must contain at least 32 bytes.');
  }
  const ttl = Number(process.env.AUTH_ACCESS_TTL_SECONDS ?? 900);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 3600) {
    throw new Error('AUTH_ACCESS_TTL_SECONDS must be an integer between 60 and 3600.');
  }
  return {
    secret: new TextEncoder().encode(secret),
    issuer: process.env.AUTH_JWT_ISSUER ?? 'uspaya-api',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'uspaya-web',
    ttl,
  };
}

export function assertInternalAuthConfiguration(): void {
  jwtConfig();
  if (process.env.AUTH_COOKIE_SECURE !== 'true') {
    throw new Error('AUTH_COOKIE_SECURE must be true when internal authentication is enabled.');
  }
  const trustedProxyHops = Number(process.env.AUTH_TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0 || trustedProxyHops > 3) {
    throw new Error('AUTH_TRUST_PROXY_HOPS must be an integer between 0 and 3.');
  }
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const { SignJWT } = await import('jose');
  const config = jwtConfig();
  return new SignJWT({ sid: claims.sid, ver: claims.ver })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${config.ttl}s`)
    .sign(config.secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { jwtVerify } = await import('jose');
  const config = jwtConfig();
  const result = await jwtVerify(token, config.secret, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ['HS256'],
  });
  const sid = result.payload.sid;
  const ver = result.payload.ver;
  if (
    typeof result.payload.sub !== 'string' ||
    typeof sid !== 'string' ||
    typeof ver !== 'number'
  ) {
    throw new Error('Invalid access token claims.');
  }
  return { sub: result.payload.sub, sid, ver };
}

function derivePasswordKey(password: string, salt: Uint8Array, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      length,
      {
        N: PASSWORD_COST,
        r: PASSWORD_BLOCK_SIZE,
        p: PASSWORD_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(derivedKey as Buffer);
      },
    );
  });
}
