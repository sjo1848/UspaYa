import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '@uspaya/database';

import { PersistenceConflictError } from '../../shared/infrastructure/persistence-errors';
import type { OrderEvent } from '../domain/order';
import { OrderPersistenceMapper } from '../infrastructure/order-persistence.mapper';

export type MerchantOrderTransition = 'ACCEPT' | 'START_PREPARATION' | 'MARK_READY';

export interface MerchantOrderTransitionCommand {
  readonly orderId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly transition: MerchantOrderTransition;
}

export interface MerchantOrderTransitionResult {
  readonly orderId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

export class OrderNotFoundError extends Error {
  readonly code = 'ORDER_NOT_FOUND';

  constructor() {
    super('The requested order was not found.');
    this.name = 'OrderNotFoundError';
  }
}

const TRANSITION_ACTIONS: Readonly<
  Record<MerchantOrderTransition, { readonly auditAction: string }>
> = Object.freeze({
  ACCEPT: { auditAction: 'AcceptOrder' },
  START_PREPARATION: { auditAction: 'StartOrderPreparation' },
  MARK_READY: { auditAction: 'MarkOrderReady' },
});

export class MerchantOrderTransitionService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(
    command: MerchantOrderTransitionCommand,
  ): Promise<MerchantOrderTransitionResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const record = await tx.order.findUnique({ where: { id: command.orderId } });
        if (record === null) {
          throw new OrderNotFoundError();
        }

        const assignment = await tx.roleAssignment.findFirst({
          where: {
            userId: command.actorId,
            role: 'MERCHANT_OPERATOR',
            branchId: record.branchId,
          },
        });
        if (assignment === null) {
          throw new OrderNotFoundError();
        }

        const order = OrderPersistenceMapper.toDomain(record);
        const previousStatus = order.status;
        const transitionResult = executeTransition(
          order,
          command.transition,
          record.branchId,
          command.expectedVersion,
        );
        const snapshot = order.toSnapshot();

        if (!transitionResult.changed) {
          return {
            orderId: snapshot.id,
            status: snapshot.status,
            version: snapshot.version,
            changed: false,
          };
        }

        const event = requireEvent(transitionResult.event);
        const update = await tx.order.updateMany({
          where: { id: snapshot.id, version: record.version },
          data: {
            status: snapshot.status,
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
            action: TRANSITION_ACTIONS[command.transition].auditAction,
            aggregateType: 'Order',
            aggregateId: snapshot.id,
            aggregateVersion: snapshot.version,
            metadata: {
              branchId: record.branchId,
              previousStatus,
              nextStatus: snapshot.status,
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
          status: snapshot.status,
          version: snapshot.version,
          changed: true,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function executeTransition(
  order: ReturnType<typeof OrderPersistenceMapper.toDomain>,
  transition: MerchantOrderTransition,
  branchId: string,
  expectedVersion: number,
) {
  switch (transition) {
    case 'ACCEPT':
      return order.accept(branchId, expectedVersion);
    case 'START_PREPARATION':
      return order.startPreparation(branchId, expectedVersion);
    case 'MARK_READY':
      return order.markReady(branchId, expectedVersion);
  }
}

function requireEvent(event: OrderEvent | undefined): OrderEvent {
  if (event === undefined) {
    throw new Error('A changed order transition must emit one domain event.');
  }
  return event;
}
