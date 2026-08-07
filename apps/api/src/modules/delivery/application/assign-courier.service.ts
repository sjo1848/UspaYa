import { randomUUID } from 'node:crypto';

import { Prisma, type DatabaseDeliveryStatus, type PrismaClient } from '@uspaya/database';

import {
  ActiveCourierAssignmentConflictError,
  PersistenceConflictError,
} from '../../shared/infrastructure/persistence-errors';
import type { DeliveryEvent } from '../domain/delivery';
import { DeliveryPersistenceMapper } from '../infrastructure/delivery-persistence.mapper';

export interface AssignCourierCommand {
  readonly deliveryId: string;
  readonly courierId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
}

export interface AssignCourierResult {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly courierId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

export class DeliveryNotFoundError extends Error {
  readonly code = 'DELIVERY_NOT_FOUND';

  constructor() {
    super('The requested delivery was not found.');
    this.name = 'DeliveryNotFoundError';
  }
}

export class DeliveryNotAssignableError extends Error {
  readonly code = 'DELIVERY_NOT_ASSIGNABLE';

  constructor() {
    super('The delivery cannot be assigned before its order is READY.');
    this.name = 'DeliveryNotAssignableError';
  }
}

export class CourierNotAvailableError extends Error {
  readonly code = 'COURIER_NOT_AVAILABLE';

  constructor() {
    super('The selected courier is not available for assignment.');
    this.name = 'CourierNotAvailableError';
  }
}

export class OperationsActorNotAuthorizedError extends Error {
  readonly code = 'ROLE_FORBIDDEN';

  constructor() {
    super('The current actor is not authorized for operations.');
    this.name = 'OperationsActorNotAuthorizedError';
  }
}

export class AssignCourierService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(command: AssignCourierCommand): Promise<AssignCourierResult> {
    try {
      return await this.prisma.$transaction(
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
            throw new OperationsActorNotAuthorizedError();
          }

          const record = await tx.delivery.findUnique({
            where: { id: command.deliveryId },
            include: {
              assignments: {
                where: { active: true },
                orderBy: { assignedAt: 'desc' },
                take: 1,
              },
              order: { select: { id: true, status: true } },
            },
          });
          if (record === null) {
            throw new DeliveryNotFoundError();
          }

          if (record.order.status !== 'READY') {
            throw new DeliveryNotAssignableError();
          }

          const courierRole = await tx.roleAssignment.findFirst({
            where: {
              userId: command.courierId,
              role: 'COURIER',
              user: { active: true },
            },
            select: { id: true },
          });
          if (courierRole === null) {
            throw new CourierNotAvailableError();
          }

          const existingCourierAssignment = await tx.courierAssignment.findFirst({
            where: { courierId: command.courierId, active: true },
            select: { deliveryId: true },
          });
          if (
            existingCourierAssignment !== null &&
            existingCourierAssignment.deliveryId !== command.deliveryId
          ) {
            throw new ActiveCourierAssignmentConflictError();
          }

          const delivery = DeliveryPersistenceMapper.toDomain(record);
          const transition = delivery.assignCourier(command.courierId, command.expectedVersion);
          const snapshot = delivery.toSnapshot();

          if (!transition.changed) {
            return {
              deliveryId: snapshot.id,
              orderId: snapshot.orderId,
              courierId: command.courierId,
              status: snapshot.status,
              version: snapshot.version,
              changed: false,
            };
          }

          const event = requireEvent(transition.event);
          const update = await tx.delivery.updateMany({
            where: { id: snapshot.id, version: record.version },
            data: {
              status: snapshot.status as DatabaseDeliveryStatus,
              version: snapshot.version,
            },
          });
          if (update.count !== 1) {
            throw new PersistenceConflictError('Delivery', snapshot.id);
          }

          await tx.courierAssignment.create({
            data: {
              id: randomUUID(),
              deliveryId: snapshot.id,
              courierId: command.courierId,
            },
          });

          await tx.auditLog.create({
            data: {
              id: randomUUID(),
              actorId: command.actorId,
              action: 'AssignCourier',
              aggregateType: 'Delivery',
              aggregateId: snapshot.id,
              aggregateVersion: snapshot.version,
              metadata: {
                orderId: snapshot.orderId,
                courierId: command.courierId,
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
            courierId: command.courierId,
            status: snapshot.status,
            version: snapshot.version,
            changed: true,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ActiveCourierAssignmentConflictError();
      }
      throw error;
    }
  }
}

function requireEvent(event: DeliveryEvent | undefined): DeliveryEvent {
  if (event === undefined) {
    throw new Error('A changed delivery transition must emit one domain event.');
  }
  return event;
}
