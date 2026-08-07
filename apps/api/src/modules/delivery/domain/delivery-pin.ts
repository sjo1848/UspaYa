import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { DomainError } from '../../shared/domain/domain-error';

const PIN_PATTERN = /^\d{4,6}$/;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const ENCODED_HASH_PATTERN = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{64})$/i;

export class DeliveryPin {
  private readonly salt: Buffer;
  private readonly derivedKey: Buffer;

  private constructor(salt: Buffer, derivedKey: Buffer) {
    this.salt = salt;
    this.derivedKey = derivedKey;
  }

  static fromPlainText(value: string): DeliveryPin {
    DeliveryPin.assertValid(value);
    const salt = randomBytes(SALT_BYTES);
    return new DeliveryPin(salt, DeliveryPin.derive(value, salt));
  }

  static fromHash(encodedHash: string): DeliveryPin {
    const match = ENCODED_HASH_PATTERN.exec(encodedHash);
    const saltHex = match?.[1];
    const derivedKeyHex = match?.[2];

    if (saltHex === undefined || derivedKeyHex === undefined) {
      throw new DomainError('INVALID_VALUE', 'Delivery PIN hash has an invalid format.');
    }

    return new DeliveryPin(Buffer.from(saltHex, 'hex'), Buffer.from(derivedKeyHex, 'hex'));
  }

  matches(candidate: string): boolean {
    if (!PIN_PATTERN.test(candidate)) {
      return false;
    }

    const candidateKey = DeliveryPin.derive(candidate, this.salt);
    return timingSafeEqual(this.derivedKey, candidateKey);
  }

  toHash(): string {
    return `scrypt$${this.salt.toString('hex')}$${this.derivedKey.toString('hex')}`;
  }

  private static assertValid(value: string): void {
    if (!PIN_PATTERN.test(value)) {
      throw new DomainError('INVALID_VALUE', 'Delivery PIN must contain 4 to 6 digits.');
    }
  }

  private static derive(value: string, salt: Buffer): Buffer {
    return scryptSync(value, salt, DERIVED_KEY_BYTES);
  }
}
