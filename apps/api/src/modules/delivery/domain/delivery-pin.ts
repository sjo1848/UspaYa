import { createHash, timingSafeEqual } from 'node:crypto';

import { DomainError } from '../../shared/domain/domain-error';

const PIN_PATTERN = /^\d{4,6}$/;

export class DeliveryPin {
  private readonly hash: Buffer;

  private constructor(hash: Buffer) {
    this.hash = hash;
  }

  static fromPlainText(value: string): DeliveryPin {
    DeliveryPin.assertValid(value);
    return new DeliveryPin(DeliveryPin.digest(value));
  }

  static fromHash(hexHash: string): DeliveryPin {
    if (!/^[a-f0-9]{64}$/i.test(hexHash)) {
      throw new DomainError('INVALID_VALUE', 'Delivery PIN hash must be a SHA-256 hex value.');
    }

    return new DeliveryPin(Buffer.from(hexHash, 'hex'));
  }

  matches(candidate: string): boolean {
    if (!PIN_PATTERN.test(candidate)) {
      return false;
    }

    return timingSafeEqual(this.hash, DeliveryPin.digest(candidate));
  }

  toHash(): string {
    return this.hash.toString('hex');
  }

  private static assertValid(value: string): void {
    if (!PIN_PATTERN.test(value)) {
      throw new DomainError('INVALID_VALUE', 'Delivery PIN must contain 4 to 6 digits.');
    }
  }

  private static digest(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
  }
}
