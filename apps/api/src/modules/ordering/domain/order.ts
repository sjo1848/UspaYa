import type { DomainEvent } from '../../shared/domain/domain-event';
import { DomainError } from '../../shared/domain/domain-error';
import { EntityId } from '../../shared/domain/entity-id';
import {
  assertExpectedVersion,
  changed,
  type TransitionResult,
  unchanged,
} from '../../shared/domain/transition';
import { OrderStatus } from './order-status';

export type OrderEventName =
  | 'OrderSubmitted'
  | 'OrderAccepted'
  | 'OrderPreparationStarted'
  | 'OrderReady'
  | 'OrderFulfilled'
  | 'OrderCompleted';

export type OrderEvent = DomainEvent<OrderEventName, Record<string, string>>;

export interface SubmitOrderInput {
  readonly orderId: string;
  readonly branchId: string;
  readonly customerId: string;
}

const HAPPY_PATH_RANK: Readonly<Partial<Record<OrderStatus, number>>> = Object.freeze({
  [OrderStatus.SUBMITTED]: 0,
  [OrderStatus.PENDING_MERCHANT]: 1,
  [OrderStatus.ACCEPTED]: 2,
  [OrderStatus.PREPARING]: 3,
  [OrderStatus.READY]: 4,
  [OrderStatus.FULFILLED]: 5,
  [OrderStatus.COMPLETED]: 6,
});

export class Order {
  readonly id: EntityId;
  readonly branchId: EntityId;
  readonly customerId: EntityId;

  private currentStatus: OrderStatus;
  private currentVersion: number;
  private readonly events: OrderEvent[];

  private constructor(input: SubmitOrderInput) {
    this.id = EntityId.of(input.orderId, 'orderId');
    this.branchId = EntityId.of(input.branchId, 'branchId');
    this.customerId = EntityId.of(input.customerId, 'customerId');
    this.currentStatus = OrderStatus.SUBMITTED;
    this.currentVersion = 1;
    this.events = [
      this.createEvent('OrderSubmitted', {
        branchId: this.branchId.value,
        customerId: this.customerId.value,
      }),
    ];
  }

  static submit(input: SubmitOrderInput): Order {
    return new Order(input);
  }

  get status(): OrderStatus {
    return this.currentStatus;
  }

  get version(): number {
    return this.currentVersion;
  }

  pullDomainEvents(): readonly OrderEvent[] {
    const copy = [...this.events];
    this.events.length = 0;
    return copy;
  }

  sendToMerchant(expectedVersion: number): TransitionResult {
    if (this.isAtOrAfter(OrderStatus.PENDING_MERCHANT)) {
      return unchanged(this.currentVersion);
    }

    this.assertStatus(OrderStatus.SUBMITTED);
    assertExpectedVersion(this.currentVersion, expectedVersion);
    this.currentStatus = OrderStatus.PENDING_MERCHANT;
    this.currentVersion += 1;
    return { changed: true, version: this.currentVersion };
  }

  accept(actorBranchId: string, expectedVersion: number): TransitionResult<OrderEvent> {
    this.assertBranch(actorBranchId);
    if (this.isAtOrAfter(OrderStatus.ACCEPTED)) {
      return unchanged(this.currentVersion);
    }

    return this.transition(
      OrderStatus.PENDING_MERCHANT,
      OrderStatus.ACCEPTED,
      'OrderAccepted',
      expectedVersion,
      { branchId: this.branchId.value },
    );
  }

  startPreparation(actorBranchId: string, expectedVersion: number): TransitionResult<OrderEvent> {
    this.assertBranch(actorBranchId);
    if (this.isAtOrAfter(OrderStatus.PREPARING)) {
      return unchanged(this.currentVersion);
    }

    return this.transition(
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      'OrderPreparationStarted',
      expectedVersion,
      { branchId: this.branchId.value },
    );
  }

  markReady(actorBranchId: string, expectedVersion: number): TransitionResult<OrderEvent> {
    this.assertBranch(actorBranchId);
    if (this.isAtOrAfter(OrderStatus.READY)) {
      return unchanged(this.currentVersion);
    }

    return this.transition(
      OrderStatus.PREPARING,
      OrderStatus.READY,
      'OrderReady',
      expectedVersion,
      { branchId: this.branchId.value },
    );
  }

  markFulfilled(expectedVersion: number, deliveryId: string): TransitionResult<OrderEvent> {
    if (this.isAtOrAfter(OrderStatus.FULFILLED)) {
      return unchanged(this.currentVersion);
    }

    const normalizedDeliveryId = EntityId.of(deliveryId, 'deliveryId');
    return this.transition(
      OrderStatus.READY,
      OrderStatus.FULFILLED,
      'OrderFulfilled',
      expectedVersion,
      { deliveryId: normalizedDeliveryId.value },
    );
  }

  complete(expectedVersion: number): TransitionResult<OrderEvent> {
    if (this.currentStatus === OrderStatus.COMPLETED) {
      return unchanged(this.currentVersion);
    }

    return this.transition(
      OrderStatus.FULFILLED,
      OrderStatus.COMPLETED,
      'OrderCompleted',
      expectedVersion,
      {},
    );
  }

  private transition(
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    eventName: OrderEventName,
    expectedVersion: number,
    payload: Record<string, string>,
  ): TransitionResult<OrderEvent> {
    this.assertStatus(expectedStatus);
    assertExpectedVersion(this.currentVersion, expectedVersion);
    this.currentStatus = nextStatus;
    this.currentVersion += 1;

    const event = this.createEvent(eventName, payload);
    this.events.push(event);
    return changed(event);
  }

  private createEvent(name: OrderEventName, payload: Record<string, string>): OrderEvent {
    return {
      name,
      aggregateId: this.id.value,
      aggregateVersion: this.currentVersion,
      payload: Object.freeze({ ...payload }),
    };
  }

  private assertStatus(expected: OrderStatus): void {
    if (this.currentStatus !== expected) {
      throw new DomainError('INVALID_STATE', 'Order cannot execute this transition.', {
        actualStatus: this.currentStatus,
        expectedStatus: expected,
      });
    }
  }

  private assertBranch(actorBranchId: string): void {
    if (!this.branchId.equals(EntityId.of(actorBranchId, 'actorBranchId'))) {
      throw new DomainError('FORBIDDEN', 'Branch is not allowed to mutate this order.');
    }
  }

  private isAtOrAfter(target: OrderStatus): boolean {
    const actualRank = HAPPY_PATH_RANK[this.currentStatus];
    const targetRank = HAPPY_PATH_RANK[target];
    return actualRank !== undefined && targetRank !== undefined && actualRank >= targetRank;
  }
}
