import { randomUUID } from 'node:crypto';

import {
  createRequestHash,
  IdempotencyConflictError,
  Prisma,
  type DatabaseDeliveryStatus,
  type DatabaseOrderStatus,
  type DatabasePaymentStatus,
  type PrismaClient,
} from '@uspaya/database';

import { OrderPersistenceMapper } from '../../ordering/infrastructure/order-persistence.mapper';
import { Payment } from '../../payment/domain/payment';
import { DomainError } from '../../shared/domain/domain-error';
import { PersistenceConflictError } from '../../shared/infrastructure/persistence-errors';
import type { DeliveryEvent } from '../domain/delivery';
import { DeliveryPersistenceMapper } from '../infrastructure/delivery-persistence.mapper';
import { DeliveryNotFoundError } from './assign-courier.service';
import { CourierActorNotAuthorizedError } from './courier-pickup.service';

export interface ConfirmDeliveryCommand {
  readonly idempotencyKey: string;
  readonly deliveryId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly pin: string;
  readonly receiver: string;
  readonly cashReceivedCents: number;
}

export interface ConfirmDeliveryResult {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly deliveryStatus: 'DELIVERED';
  readonly paymentStatus: 'CONFIRMED';
  readonly orderStatus: 'FULFILLED';
  readonly deliveryVersion: number;
  readonly paymentVersion: number;
  readonly orderVersion: number;
  readonly changed: boolean;
}

export class ConfirmDeliveryInProgressError extends Error {
  readonly code = 'IDEMPOTENCY_OPERATION_IN_PROGRESS';

  constructor() {
    super('An operation with this idempotency key is already in progress.');
    this.name = 'ConfirmDeliveryInProgressError';
  }
}

export class InvalidConfirmDeliveryIdempotencyKeyError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_INVALID';

  constructor() {
    super('Idempotency key must contain 8 to 128 characters.');
    this.name = 'InvalidConfirmDeliveryIdempotencyKeyError';
  }
}

export class ConfirmDeliveryService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(command: ConfirmDeliveryCommand): Promise<ConfirmDeliveryResult> {
    const key = command.idempotencyKey.trim();
    if (key.length < 8 || key.length > 128) {
      throw new InvalidConfirmDeliveryIdempotencyKeyError();
    }

    const requestHash = createRequestHash({
      deliveryId: command.deliveryId,
      actorId: command.actorId,
      expectedVersion: command.expectedVersion,
      pin: command.pin,
      receiver: command.receiver,
      cashReceivedCents: command.cashReceivedCents,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.executeTransaction(command, key, requestHash);
      } catch (error) {
        if (!isRecoverableIdempotencyRace(error)) {
          throw error;
        }

        const recovered = await this.recoverConcurrentResult(key, requestHash);
        if (recovered !== undefined) {
          return recovered;
        }
        if (
          attempt === 0 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('ConfirmDelivery retry loop ended unexpectedly.');
  }

  private async executeTransaction(
    command: ConfirmDeliveryCommand,
    key: string,
    requestHash: string,
  ): Promise<ConfirmDeliveryResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({
          where: { scope_key: { scope: 'ConfirmDelivery', key } },
        });
        if (existing !== null) {
          if (existing.requestHash !== requestHash) {
            throw new IdempotencyConflictError();
          }
          if (existing.status !== 'COMPLETED') {
            throw new ConfirmDeliveryInProgressError();
          }
          return readStoredResult(existing.responseBody);
        }

        await tx.idempotencyRecord.create({
          data: {
            id: randomUUID(),
            scope: 'ConfirmDelivery',
            key,
            requestHash,
            status: 'IN_PROGRESS',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        const courierRole = await tx.roleAssignment.findFirst({
          where: {
            userId: command.actorId,
            role: 'COURIER',
            user: { active: true },
          },
          select: { id: true },
        });
        if (courierRole === null) {
          throw new CourierActorNotAuthorizedError();
        }

        const record = await tx.delivery.findFirst({
          where: {
            id: command.deliveryId,
            assignments: {
              some: {
                courierId: command.actorId,
                active: true,
              },
            },
          },
          include: {
            assignments: {
              where: {
                courierId: command.actorId,
                active: true,
              },
              orderBy: { assignedAt: 'desc' },
              take: 1,
            },
            order: {
              include: { payment: true },
            },
          },
        });
        if (record === null || record.order.payment === null) {
          throw new DeliveryNotFoundError();
        }
        if (record.order.payment.status !== 'PENDING') {
          throw new DomainError(
            'BUSINESS_RULE_VIOLATION',
            'Cash payment must be pending before final delivery confirmation.',
            { actualPaymentStatus: record.order.payment.status },
          );
        }

        const delivery = DeliveryPersistenceMapper.toDomain(record);
        const order = OrderPersistenceMapper.toDomain(record.order);
        const payment = Payment.restore({
          id: record.order.payment.id,
          orderId: record.order.payment.orderId,
          status: record.order.payment.status,
          amountCents: record.order.payment.amountCents,
          version: record.order.payment.version,
        });

        const deliveryTransition = delivery.confirmDelivery({
          courierId: command.actorId,
          expectedVersion: command.expectedVersion,
          pin: command.pin,
          receiver: command.receiver,
          cashReceivedCents: command.cashReceivedCents,
        });
        const deliverySnapshot = delivery.toSnapshot();
        const deliveryEvent = requireDeliveryEvent(deliveryTransition.event);

        const paymentTransition = payment.confirmCash(payment.version, command.cashReceivedCents);
        const paymentSnapshot = payment.toSnapshot();
        const paymentEvent = paymentTransition.event;
        if (paymentEvent === undefined) {
          throw new Error('A new delivery confirmation must confirm the payment.');
        }

        const orderTransition = order.markFulfilled(order.version, deliverySnapshot.id);
        const orderSnapshot = order.toSnapshot();
        const orderEvent = orderTransition.event;
        if (orderEvent === undefined) {
          throw new Error('A new delivery confirmation must fulfill the order.');
        }

        const deliveryUpdate = await tx.delivery.updateMany({
          where: { id: deliverySnapshot.id, version: record.version },
          data: {
            status: deliverySnapshot.status as DatabaseDeliveryStatus,
            version: deliverySnapshot.version,
          },
        });
        const paymentUpdate = await tx.payment.updateMany({
          where: { id: paymentSnapshot.id, version: record.order.payment.version },
          data: {
            status: paymentSnapshot.status as DatabasePaymentStatus,
            version: paymentSnapshot.version,
          },
        });
        const orderUpdate = await tx.order.updateMany({
          where: { id: orderSnapshot.id, version: record.order.version },
          data: {
            status: orderSnapshot.status as DatabaseOrderStatus,
            version: orderSnapshot.version,
          },
        });
        if (deliveryUpdate.count !== 1) {
          throw new PersistenceConflictError('Delivery', deliverySnapshot.id);
        }
        if (paymentUpdate.count !== 1) {
          throw new PersistenceConflictError('Payment', paymentSnapshot.id);
        }
        if (orderUpdate.count !== 1) {
          throw new PersistenceConflictError('Order', orderSnapshot.id);
        }

        const endedAt = new Date();
        const released = await tx.courierAssignment.updateMany({
          where: {
            deliveryId: deliverySnapshot.id,
            courierId: command.actorId,
            active: true,
          },
          data: { active: false, endedAt },
        });
        if (released.count !== 1) {
          throw new PersistenceConflictError('CourierAssignment', deliverySnapshot.id);
        }

        await tx.auditLog.createMany({
          data: [
            {
              id: randomUUID(),
              actorId: command.actorId,
              action: 'ConfirmDelivery',
              aggregateType: 'Delivery',
              aggregateId: deliverySnapshot.id,
              aggregateVersion: deliverySnapshot.version,
              metadata: {
                orderId: orderSnapshot.id,
                receiver: command.receiver.trim(),
                cashReceivedCents: command.cashReceivedCents,
              },
            },
            {
              id: randomUUID(),
              actorId: command.actorId,
              action: 'ConfirmPayment',
              aggregateType: 'Payment',
              aggregateId: paymentSnapshot.id,
              aggregateVersion: paymentSnapshot.version,
              metadata: {
                orderId: orderSnapshot.id,
                method: 'CASH',
                amountCents: paymentSnapshot.amountCents,
              },
            },
            {
              id: randomUUID(),
              actorId: command.actorId,
              action: 'MarkOrderFulfilled',
              aggregateType: 'Order',
              aggregateId: orderSnapshot.id,
              aggregateVersion: orderSnapshot.version,
              metadata: { deliveryId: deliverySnapshot.id },
            },
            {
              id: randomUUID(),
              actorId: command.actorId,
              action: 'ReleaseCourierAssignment',
              aggregateType: 'Delivery',
              aggregateId: deliverySnapshot.id,
              aggregateVersion: deliverySnapshot.version,
              metadata: {
                courierId: command.actorId,
                endedAt: endedAt.toISOString(),
              },
            },
          ],
        });

        await tx.outboxEvent.createMany({
          data: [
            eventRow('Delivery', deliveryEvent),
            eventRow('Payment', paymentEvent),
            eventRow('Order', orderEvent),
            {
              id: randomUUID(),
              aggregateType: 'Delivery',
              aggregateId: deliverySnapshot.id,
              aggregateVersion: deliverySnapshot.version,
              eventName: 'CourierAssignmentReleased',
              payload: { courierId: command.actorId },
            },
          ],
        });

        const result: ConfirmDeliveryResult = {
          deliveryId: deliverySnapshot.id,
          orderId: orderSnapshot.id,
          paymentId: paymentSnapshot.id,
          deliveryStatus: 'DELIVERED',
          paymentStatus: 'CONFIRMED',
          orderStatus: 'FULFILLED',
          deliveryVersion: deliverySnapshot.version,
          paymentVersion: paymentSnapshot.version,
          orderVersion: orderSnapshot.version,
          changed: true,
        };
        await tx.idempotencyRecord.update({
          where: { scope_key: { scope: 'ConfirmDelivery', key } },
          data: {
            status: 'COMPLETED',
            responseStatus: 200,
            responseBody: result as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async recoverConcurrentResult(
    key: string,
    requestHash: string,
  ): Promise<ConfirmDeliveryResult | undefined> {
    for (const delayMs of [0, 25, 75, 150] as const) {
      if (delayMs > 0) {
        await delay(delayMs);
      }
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { scope_key: { scope: 'ConfirmDelivery', key } },
      });
      if (existing === null) {
        continue;
      }
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError();
      }
      if (existing.status === 'COMPLETED') {
        return readStoredResult(existing.responseBody);
      }
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope: 'ConfirmDelivery', key } },
    });
    if (existing !== null) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError();
      }
      throw new ConfirmDeliveryInProgressError();
    }
    return undefined;
  }
}

function eventRow(
  aggregateType: 'Delivery' | 'Payment' | 'Order',
  event: {
    readonly name: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly payload: object;
  },
) {
  return {
    id: randomUUID(),
    aggregateType,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
    eventName: event.name,
    payload: event.payload as Prisma.InputJsonValue,
  };
}

function requireDeliveryEvent(event: DeliveryEvent | undefined): DeliveryEvent {
  if (event === undefined) {
    throw new Error('A new delivery confirmation must emit DeliveryCompleted.');
  }
  return event;
}

function isRecoverableIdempotencyRace(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readStoredResult(value: Prisma.JsonValue | null): ConfirmDeliveryResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored delivery confirmation result is invalid.');
  }
  const record = value as Record<string, Prisma.JsonValue>;
  if (
    typeof record.deliveryId !== 'string' ||
    typeof record.orderId !== 'string' ||
    typeof record.paymentId !== 'string' ||
    record.deliveryStatus !== 'DELIVERED' ||
    record.paymentStatus !== 'CONFIRMED' ||
    record.orderStatus !== 'FULFILLED' ||
    typeof record.deliveryVersion !== 'number' ||
    typeof record.paymentVersion !== 'number' ||
    typeof record.orderVersion !== 'number' ||
    typeof record.changed !== 'boolean'
  ) {
    throw new Error('Stored delivery confirmation result is incomplete.');
  }
  return {
    deliveryId: record.deliveryId,
    orderId: record.orderId,
    paymentId: record.paymentId,
    deliveryStatus: 'DELIVERED',
    paymentStatus: 'CONFIRMED',
    orderStatus: 'FULFILLED',
    deliveryVersion: record.deliveryVersion,
    paymentVersion: record.paymentVersion,
    orderVersion: record.orderVersion,
    changed: record.changed,
  };
}
