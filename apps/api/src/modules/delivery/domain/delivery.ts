import type { DomainEvent } from '../../shared/domain/domain-event';
import { DomainError } from '../../shared/domain/domain-error';
import { EntityId } from '../../shared/domain/entity-id';
import {
  assertExpectedVersion,
  changed,
  type TransitionResult,
  unchanged,
} from '../../shared/domain/transition';
import { OrderStatus } from '../../ordering/domain/order-status';
import { DeliveryPin } from './delivery-pin';
import { DeliveryStatus } from './delivery-status';

export type DeliveryEventName =
  | 'DeliveryRequested'
  | 'CourierAssigned'
  | 'PickupStarted'
  | 'OrderPickedUp'
  | 'DeliveryStarted'
  | 'CourierArrived'
  | 'DeliveryCompleted';

export type DeliveryEvent = DomainEvent<DeliveryEventName, Record<string, string | number>>;

export interface RequestDeliveryInput {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly plainTextPin: string;
  readonly expectedCashCents: number;
}

export interface DeliverySnapshot {
  readonly id: string;
  readonly orderId: string;
  readonly status: DeliveryStatus;
  readonly version: number;
  readonly expectedCashCents: number;
  readonly pinHash: string;
  readonly courierId?: string;
}

interface DeliveryState {
  readonly id: EntityId;
  readonly orderId: EntityId;
  readonly status: DeliveryStatus;
  readonly version: number;
  readonly expectedCashCents: number;
  readonly pin: DeliveryPin;
  readonly events: DeliveryEvent[];
  readonly courierId?: EntityId;
}

const HAPPY_PATH_RANK: Readonly<Partial<Record<DeliveryStatus, number>>> = Object.freeze({
  [DeliveryStatus.PENDING_ASSIGNMENT]: 0,
  [DeliveryStatus.ASSIGNED]: 1,
  [DeliveryStatus.PICKUP_IN_PROGRESS]: 2,
  [DeliveryStatus.PICKED_UP]: 3,
  [DeliveryStatus.ON_THE_WAY]: 4,
  [DeliveryStatus.ARRIVED]: 5,
  [DeliveryStatus.DELIVERED]: 6,
});

export class Delivery {
  readonly id: EntityId;
  readonly orderId: EntityId;
  readonly expectedCashCents: number;

  private currentStatus: DeliveryStatus;
  private currentVersion: number;
  private assignedCourierId: EntityId | undefined;
  private readonly pin: DeliveryPin;
  private readonly events: DeliveryEvent[];

  private constructor(state: DeliveryState) {
    this.id = state.id;
    this.orderId = state.orderId;
    this.expectedCashCents = state.expectedCashCents;
    this.currentStatus = state.status;
    this.currentVersion = state.version;
    this.pin = state.pin;
    this.events = state.events;
    this.assignedCourierId = state.courierId;
  }

  static request(input: RequestDeliveryInput): Delivery {
    const delivery = new Delivery({
      id: EntityId.of(input.deliveryId, 'deliveryId'),
      orderId: EntityId.of(input.orderId, 'orderId'),
      expectedCashCents: Delivery.assertMoney(input.expectedCashCents),
      pin: DeliveryPin.fromPlainText(input.plainTextPin),
      status: DeliveryStatus.PENDING_ASSIGNMENT,
      version: 1,
      events: [],
    });
    delivery.events.push(
      delivery.createEvent('DeliveryRequested', {
        orderId: delivery.orderId.value,
        expectedCashCents: delivery.expectedCashCents,
      }),
    );
    return delivery;
  }

  static restore(snapshot: DeliverySnapshot): Delivery {
    Delivery.assertVersion(snapshot.version);
    return new Delivery({
      id: EntityId.of(snapshot.id, 'deliveryId'),
      orderId: EntityId.of(snapshot.orderId, 'orderId'),
      expectedCashCents: Delivery.assertMoney(snapshot.expectedCashCents),
      pin: DeliveryPin.fromHash(snapshot.pinHash),
      status: snapshot.status,
      version: snapshot.version,
      events: [],
      ...(snapshot.courierId === undefined
        ? {}
        : { courierId: EntityId.of(snapshot.courierId, 'courierId') }),
    });
  }

  get status(): DeliveryStatus {
    return this.currentStatus;
  }

  get version(): number {
    return this.currentVersion;
  }

  get courierId(): string | undefined {
    return this.assignedCourierId?.value;
  }

  toSnapshot(): DeliverySnapshot {
    return {
      id: this.id.value,
      orderId: this.orderId.value,
      status: this.currentStatus,
      version: this.currentVersion,
      expectedCashCents: this.expectedCashCents,
      pinHash: this.pin.toHash(),
      ...(this.assignedCourierId === undefined ? {} : { courierId: this.assignedCourierId.value }),
    };
  }

  pullDomainEvents(): readonly DeliveryEvent[] {
    const copy = [...this.events];
    this.events.length = 0;
    return copy;
  }

  assignCourier(courierId: string, expectedVersion: number): TransitionResult<DeliveryEvent> {
    const courier = EntityId.of(courierId, 'courierId');
    if (this.assignedCourierId !== undefined) {
      if (this.assignedCourierId.equals(courier) && this.isAtOrAfter(DeliveryStatus.ASSIGNED)) {
        return unchanged(this.currentVersion);
      }

      throw new DomainError('BUSINESS_RULE_VIOLATION', 'Delivery already has an active courier.');
    }

    this.assertStatus(DeliveryStatus.PENDING_ASSIGNMENT);
    assertExpectedVersion(this.currentVersion, expectedVersion);
    this.assignedCourierId = courier;
    return this.transition(DeliveryStatus.ASSIGNED, 'CourierAssigned', {
      courierId: courier.value,
    });
  }

  startPickup(
    courierId: string,
    orderStatus: OrderStatus,
    expectedVersion: number,
  ): TransitionResult<DeliveryEvent> {
    this.assertCourier(courierId);
    if (this.isAtOrAfter(DeliveryStatus.PICKUP_IN_PROGRESS)) {
      return unchanged(this.currentVersion);
    }

    if (orderStatus !== OrderStatus.READY) {
      throw new DomainError(
        'BUSINESS_RULE_VIOLATION',
        'Pickup cannot start before order is READY.',
        { orderStatus },
      );
    }

    this.assertStatus(DeliveryStatus.ASSIGNED);
    assertExpectedVersion(this.currentVersion, expectedVersion);
    return this.transition(DeliveryStatus.PICKUP_IN_PROGRESS, 'PickupStarted', {
      courierId: this.requireCourier().value,
    });
  }

  confirmPickup(input: {
    readonly courierId: string;
    readonly orderStatus: OrderStatus;
    readonly expectedVersion: number;
    readonly merchantResponsible: string;
    readonly packageCount: number;
  }): TransitionResult<DeliveryEvent> {
    this.assertCourier(input.courierId);
    if (this.isAtOrAfter(DeliveryStatus.PICKED_UP)) {
      return unchanged(this.currentVersion);
    }

    if (input.orderStatus !== OrderStatus.READY) {
      throw new DomainError('BUSINESS_RULE_VIOLATION', 'Pickup cannot be confirmed before READY.', {
        orderStatus: input.orderStatus,
      });
    }

    const responsible = input.merchantResponsible.trim();
    if (
      responsible.length === 0 ||
      !Number.isInteger(input.packageCount) ||
      input.packageCount < 1
    ) {
      throw new DomainError(
        'INVALID_VALUE',
        'Pickup requires a merchant responsible and at least one package.',
      );
    }

    this.assertStatus(DeliveryStatus.PICKUP_IN_PROGRESS);
    assertExpectedVersion(this.currentVersion, input.expectedVersion);
    return this.transition(DeliveryStatus.PICKED_UP, 'OrderPickedUp', {
      courierId: this.requireCourier().value,
      merchantResponsible: responsible,
      packageCount: input.packageCount,
    });
  }

  startDelivery(courierId: string, expectedVersion: number): TransitionResult<DeliveryEvent> {
    this.assertCourier(courierId);
    if (this.isAtOrAfter(DeliveryStatus.ON_THE_WAY)) {
      return unchanged(this.currentVersion);
    }

    this.assertStatus(DeliveryStatus.PICKED_UP);
    assertExpectedVersion(this.currentVersion, expectedVersion);
    return this.transition(DeliveryStatus.ON_THE_WAY, 'DeliveryStarted', {
      courierId: this.requireCourier().value,
    });
  }

  reportArrival(courierId: string, expectedVersion: number): TransitionResult<DeliveryEvent> {
    this.assertCourier(courierId);
    if (this.isAtOrAfter(DeliveryStatus.ARRIVED)) {
      return unchanged(this.currentVersion);
    }

    this.assertStatus(DeliveryStatus.ON_THE_WAY);
    assertExpectedVersion(this.currentVersion, expectedVersion);
    return this.transition(DeliveryStatus.ARRIVED, 'CourierArrived', {
      courierId: this.requireCourier().value,
    });
  }

  confirmDelivery(input: {
    readonly courierId: string;
    readonly expectedVersion: number;
    readonly pin: string;
    readonly receiver: string;
    readonly cashReceivedCents: number;
  }): TransitionResult<DeliveryEvent> {
    this.assertCourier(input.courierId);
    if (this.currentStatus === DeliveryStatus.DELIVERED) {
      return unchanged(this.currentVersion);
    }

    this.assertStatus(DeliveryStatus.ARRIVED);
    assertExpectedVersion(this.currentVersion, input.expectedVersion);

    if (!this.pin.matches(input.pin)) {
      throw new DomainError('BUSINESS_RULE_VIOLATION', 'Delivery PIN is invalid.');
    }

    const receiver = input.receiver.trim();
    if (receiver.length === 0) {
      throw new DomainError('INVALID_VALUE', 'Delivery receiver must not be empty.');
    }

    const cashReceivedCents = Delivery.assertMoney(input.cashReceivedCents);
    if (cashReceivedCents !== this.expectedCashCents) {
      throw new DomainError(
        'BUSINESS_RULE_VIOLATION',
        'Cash received differs from expected amount.',
        { expectedCashCents: this.expectedCashCents, cashReceivedCents },
      );
    }

    return this.transition(DeliveryStatus.DELIVERED, 'DeliveryCompleted', {
      courierId: this.requireCourier().value,
      receiver,
      cashReceivedCents,
    });
  }

  private transition(
    nextStatus: DeliveryStatus,
    eventName: DeliveryEventName,
    payload: Record<string, string | number>,
  ): TransitionResult<DeliveryEvent> {
    this.currentStatus = nextStatus;
    this.currentVersion += 1;
    const event = this.createEvent(eventName, payload);
    this.events.push(event);
    return changed(event);
  }

  private createEvent(
    name: DeliveryEventName,
    payload: Record<string, string | number>,
  ): DeliveryEvent {
    return {
      name,
      aggregateId: this.id.value,
      aggregateVersion: this.currentVersion,
      payload: Object.freeze({ ...payload }),
    };
  }

  private assertStatus(expected: DeliveryStatus): void {
    if (this.currentStatus !== expected) {
      throw new DomainError('INVALID_STATE', 'Delivery cannot execute this transition.', {
        actualStatus: this.currentStatus,
        expectedStatus: expected,
      });
    }
  }

  private assertCourier(courierId: string): void {
    const courier = EntityId.of(courierId, 'courierId');
    if (this.assignedCourierId === undefined || !this.assignedCourierId.equals(courier)) {
      throw new DomainError('FORBIDDEN', 'Courier is not assigned to this delivery.');
    }
  }

  private requireCourier(): EntityId {
    if (this.assignedCourierId === undefined) {
      throw new DomainError('INVALID_STATE', 'Delivery has no assigned courier.');
    }
    return this.assignedCourierId;
  }

  private isAtOrAfter(target: DeliveryStatus): boolean {
    const actualRank = HAPPY_PATH_RANK[this.currentStatus];
    const targetRank = HAPPY_PATH_RANK[target];
    return actualRank !== undefined && targetRank !== undefined && actualRank >= targetRank;
  }

  private static assertMoney(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new DomainError('INVALID_VALUE', 'Money must be a non-negative integer in cents.');
    }
    return value;
  }

  private static assertVersion(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new DomainError('INVALID_VALUE', 'Delivery snapshot version must be positive.');
    }
  }
}
