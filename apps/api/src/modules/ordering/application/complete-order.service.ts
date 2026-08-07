import { randomUUID } from 'node:crypto';

import { Prisma, type DatabaseOrderStatus, type PrismaClient } from '@uspaya/database';

import { PersistenceConflictError } from '../../shared/infrastructure/persistence-errors';
import type { OrderEvent } from '../domain/order';
import { OrderPersistenceMapper } from '../infrastructure/order-persistence.mapper';
import { OrderNotFoundError } from './merchant-order-transition.service';

export interface CompleteOrderCommand {
  readonly orderId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
}

export interface CompleteOrderResult {
  readonly orderId: string;
  readonly status: 'COMPLETED';
  readonly version: number;
  readonly changed: boolean;
}

export class OrderNotCompletableError extends Error {
  readonly code = 'ORDER_NOT_COMPLETABLE';

  constructor() {
    super('The order still has an open delivery, payment or courier assignment.');
    this.name = 'OrderNotCompletableError';
  }
}

export class CompleteOrderService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(command: CompleteOrderCommand): Promise<CompleteOrderResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const operationsRole = await tx.roleAssignment.findFirst({
          where: {
            userId: command.actorId,
            role: 'OPERATIONS',
            user: { active: true },
          },
          select: { id: true },
        });
        if (operationsRole === null) {
          throw new OrderNotFoundError();
        }

        const record = await tx.order.findUnique({
          where: { id: command.orderId },
          include: {
            payment: true,
            delivery: {
              include: {
                assignments: {
                  where: { active: true },
                  select: { id: true },
                },
              },
            },
          },
        });
        if (record === null) {
          throw new OrderNotFoundError();
        }

        if (
          record.payment?.status !== 'CONFIRMED' ||
          record.delivery?.status !== 'DELIVERED' ||
          record.delivery.assignments.length !== 0
        ) {
          throw new OrderNotCompletableError();
        }

        const order = OrderPersistenceMapper.toDomain(record);
        const transition = order.complete(command.expectedVersion);
        const snapshot = order.toSnapshot();

        if (!transition.changed) {
          return {
            orderId: snapshot.id,
            status: 'COMPLETED',
            version: snapshot.version,
            changed: false,
          };
        }

        const event = requireEvent(transition.event);
        const update = await tx.order.updateMany({
          where: { id: snapshot.id, version: record.version },
          data: {
            status: snapshot.status as DatabaseOrderStatus,
            version: snapshot.version,
          },
        });
        if (update.count !== 1) {
          throw new PersistenceConflictError('Order', snapshot.id);
        }

        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: command.actorId,
            action: 'CompleteOrder',
            aggregateType: 'Order',
            aggregateId: snapshot.id,
            aggregateVersion: snapshot.version,
            metadata: {
              deliveryStatus: record.delivery.status,
              paymentStatus: record.payment.status,
            },
          },
        });
        await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            aggregateType: 'Order',
            aggregateId: event.aggregateId,
            aggregateVersion: event.aggregateVersion,
            eventName: event.name,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });

        return {
          orderId: snapshot.id,
          status: 'COMPLETED',
          version: snapshot.version,
          changed: true,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function requireEvent(event: OrderEvent | undefined): OrderEvent {
  if (event === undefined) {
    throw new Error('A changed order completion must emit OrderCompleted.');
  }
  return event;
}
