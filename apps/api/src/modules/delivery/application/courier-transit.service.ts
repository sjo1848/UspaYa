import { randomUUID } from 'node:crypto';

import { Prisma, type DatabaseDeliveryStatus, type PrismaClient } from '@uspaya/database';

import { PersistenceConflictError } from '../../shared/infrastructure/persistence-errors';
import type { DeliveryEvent } from '../domain/delivery';
import { DeliveryPersistenceMapper } from '../infrastructure/delivery-persistence.mapper';
import { DeliveryNotFoundError } from './assign-courier.service';
import { CourierActorNotAuthorizedError } from './courier-pickup.service';

export type CourierTransitTransition = 'START_DELIVERY' | 'REPORT_ARRIVAL';

export interface CourierTransitCommand {
  readonly deliveryId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly transition: CourierTransitTransition;
}

export interface CourierTransitResult {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly courierId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

export class CourierTransitService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(command: CourierTransitCommand): Promise<CourierTransitResult> {
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
          },
        });
        if (record === null) {
          throw new DeliveryNotFoundError();
        }

        const delivery = DeliveryPersistenceMapper.toDomain(record);
        const previousStatus = delivery.status;
        const transition = executeTransition(delivery, command);
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
            action:
              command.transition === 'START_DELIVERY'
                ? 'StartDelivery'
                : 'ReportCourierArrival',
            aggregateType: 'Delivery',
            aggregateId: snapshot.id,
            aggregateVersion: snapshot.version,
            metadata: {
              orderId: snapshot.orderId,
              courierId: command.actorId,
              previousStatus,
              nextStatus: snapshot.status,
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

function executeTransition(
  delivery: ReturnType<typeof DeliveryPersistenceMapper.toDomain>,
  command: CourierTransitCommand,
) {
  if (command.transition === 'START_DELIVERY') {
    return delivery.startDelivery(command.actorId, command.expectedVersion);
  }

  return delivery.reportArrival(command.actorId, command.expectedVersion);
}

function requireEvent(event: DeliveryEvent | undefined): DeliveryEvent {
  if (event === undefined) {
    throw new Error('A changed delivery transition must emit one domain event.');
  }
  return event;
}
