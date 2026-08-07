import { randomUUID } from 'node:crypto';

import { Prisma, type DatabaseDeliveryStatus, type PrismaClient } from '@uspaya/database';

import { OrderStatus } from '../../ordering/domain/order-status';
import { PersistenceConflictError } from '../../shared/infrastructure/persistence-errors';
import type { DeliveryEvent } from '../domain/delivery';
import { DeliveryPersistenceMapper } from '../infrastructure/delivery-persistence.mapper';
import { DeliveryNotFoundError } from './assign-courier.service';

export type CourierPickupTransition = 'START_PICKUP' | 'CONFIRM_PICKUP';

export interface CourierPickupCommand {
  readonly deliveryId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly transition: CourierPickupTransition;
  readonly merchantResponsible?: string;
  readonly packageCount?: number;
}

export interface CourierPickupResult {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly courierId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

export class CourierActorNotAuthorizedError extends Error {
  readonly code = 'ROLE_FORBIDDEN';

  constructor() {
    super('The current actor is not authorized as courier.');
    this.name = 'CourierActorNotAuthorizedError';
  }
}

export class CourierPickupService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(command: CourierPickupCommand): Promise<CourierPickupResult> {
    return this.prisma.$transaction(
      async (tx) => {
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
              select: {
                id: true,
                status: true,
              },
            },
          },
        });
        if (record === null) {
          throw new DeliveryNotFoundError();
        }

        const delivery = DeliveryPersistenceMapper.toDomain(record);
        const previousStatus = delivery.status;
        const evidence = normalizeEvidence(command);
        const transition = executeTransition(
          delivery,
          command,
          evidence,
          record.order.status as OrderStatus,
        );
        const snapshot = delivery.toSnapshot();

        if (!transition.changed) {
          return {
            deliveryId: snapshot.id,
            orderId: snapshot.orderId,
            courierId: command.actorId,
            status: snapshot.status,
            version: snapshot.version,
            changed: false,
          };
        }

        const event = requireEvent(transition.event);
        const update = await tx.delivery.updateMany({
          where: {
            id: snapshot.id,
            version: record.version,
          },
          data: {
            status: snapshot.status as DatabaseDeliveryStatus,
            version: snapshot.version,
          },
        });
        if (update.count !== 1) {
          throw new PersistenceConflictError('Delivery', snapshot.id);
        }

        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: command.actorId,
            action: command.transition === 'START_PICKUP' ? 'StartPickup' : 'ConfirmPickup',
            aggregateType: 'Delivery',
            aggregateId: snapshot.id,
            aggregateVersion: snapshot.version,
            metadata: {
              orderId: snapshot.orderId,
              courierId: command.actorId,
              previousStatus,
              nextStatus: snapshot.status,
              ...(evidence === undefined ? {} : evidence),
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            aggregateType: 'Delivery',
            aggregateId: event.aggregateId,
            aggregateVersion: event.aggregateVersion,
            eventName: event.name,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });

        return {
          deliveryId: snapshot.id,
          orderId: snapshot.orderId,
          courierId: command.actorId,
          status: snapshot.status,
          version: snapshot.version,
          changed: true,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

interface PickupEvidence {
  readonly merchantResponsible: string;
  readonly packageCount: number;
}

function normalizeEvidence(command: CourierPickupCommand): PickupEvidence | undefined {
  if (command.transition !== 'CONFIRM_PICKUP') {
    return undefined;
  }

  return {
    merchantResponsible: (command.merchantResponsible ?? '').trim(),
    packageCount: command.packageCount ?? 0,
  };
}

function executeTransition(
  delivery: ReturnType<typeof DeliveryPersistenceMapper.toDomain>,
  command: CourierPickupCommand,
  evidence: PickupEvidence | undefined,
  orderStatus: OrderStatus,
) {
  if (command.transition === 'START_PICKUP') {
    return delivery.startPickup(command.actorId, orderStatus, command.expectedVersion);
  }

  return delivery.confirmPickup({
    courierId: command.actorId,
    orderStatus,
    expectedVersion: command.expectedVersion,
    merchantResponsible: evidence?.merchantResponsible ?? '',
    packageCount: evidence?.packageCount ?? 0,
  });
}

function requireEvent(event: DeliveryEvent | undefined): DeliveryEvent {
  if (event === undefined) {
    throw new Error('A changed delivery transition must emit one domain event.');
  }
  return event;
}
