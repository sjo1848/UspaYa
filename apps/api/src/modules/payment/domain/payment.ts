import type { DomainEvent } from '../../shared/domain/domain-event';
import { DomainError } from '../../shared/domain/domain-error';
import { EntityId } from '../../shared/domain/entity-id';
import {
  assertExpectedVersion,
  changed,
  type TransitionResult,
  unchanged,
} from '../../shared/domain/transition';

export type PaymentStatus =
  | 'PENDING'
  | 'REPORTED'
  | 'PROCESSING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'CHARGEBACK';

export type PaymentEvent = DomainEvent<
  'PaymentConfirmed',
  Readonly<{ orderId: string; amountCents: number }>
>;

export interface PaymentSnapshot {
  readonly id: string;
  readonly orderId: string;
  readonly status: PaymentStatus;
  readonly amountCents: number;
  readonly version: number;
}

export class Payment {
  private constructor(
    readonly id: EntityId,
    readonly orderId: EntityId,
    private currentStatus: PaymentStatus,
    readonly amountCents: number,
    private currentVersion: number,
  ) {}

  static restore(snapshot: PaymentSnapshot): Payment {
    if (!Number.isSafeInteger(snapshot.amountCents) || snapshot.amountCents < 0) {
      throw new DomainError('INVALID_VALUE', 'Payment amount must be a non-negative integer.');
    }
    if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1) {
      throw new DomainError('INVALID_VALUE', 'Payment version must be a positive integer.');
    }
    return new Payment(
      EntityId.of(snapshot.id, 'paymentId'),
      EntityId.of(snapshot.orderId, 'orderId'),
      snapshot.status,
      snapshot.amountCents,
      snapshot.version,
    );
  }

  get status(): PaymentStatus {
    return this.currentStatus;
  }

  get version(): number {
    return this.currentVersion;
  }

  confirmCash(expectedVersion: number, cashReceivedCents: number): TransitionResult<PaymentEvent> {
    if (this.currentStatus === 'CONFIRMED') {
      return unchanged(this.currentVersion);
    }
    if (this.currentStatus !== 'PENDING') {
      throw new DomainError('INVALID_STATE', 'Payment cannot be confirmed from the current state.', {
        actualStatus: this.currentStatus,
        expectedStatus: 'PENDING',
      });
    }
    assertExpectedVersion(this.currentVersion, expectedVersion);
    if (!Number.isSafeInteger(cashReceivedCents) || cashReceivedCents < 0) {
      throw new DomainError('INVALID_VALUE', 'Collected cash must be a non-negative integer.');
    }
    if (cashReceivedCents !== this.amountCents) {
      throw new DomainError(
        'BUSINESS_RULE_VIOLATION',
        'Collected cash must match the expected payment amount.',
        {
          expectedCashCents: this.amountCents,
          cashReceivedCents,
        },
      );
    }

    this.currentStatus = 'CONFIRMED';
    this.currentVersion += 1;
    return changed({
      name: 'PaymentConfirmed',
      aggregateId: this.id.value,
      aggregateVersion: this.currentVersion,
      payload: Object.freeze({
        orderId: this.orderId.value,
        amountCents: this.amountCents,
      }),
    });
  }

  toSnapshot(): PaymentSnapshot {
    return {
      id: this.id.value,
      orderId: this.orderId.value,
      status: this.currentStatus,
      amountCents: this.amountCents,
      version: this.currentVersion,
    };
  }
}
