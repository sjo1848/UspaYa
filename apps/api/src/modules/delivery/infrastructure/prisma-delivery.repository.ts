import { randomUUID } from 'node:crypto';

import {
  DatabaseDeliveryStatus,
  Prisma,
  type PrismaClient,
} from '@uspaya/database';

import {
  ActiveCourierAssignmentConflictError,
  PersistenceConflictError,
} from '../../shared/infrastructure/persistence-errors';
import { Delivery } from '../domain/delivery';
import { DeliveryPersistenceMapper } from './delivery-persistence.mapper';

export class PrismaDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Delivery | null> {
    const record = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        assignments: {
          where: { active: true },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
    });
    return record === null ? null : DeliveryPersistenceMapper.toDomain(record);
  }

  async save(delivery: Delivery, persistedVersion: number): Promise<void> {
    const snapshot = DeliveryPersistenceMapper.toSnapshot(delivery);

    try {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.delivery.updateMany({
          where: { id: snapshot.id, version: persistedVersion },
          data: {
            status: snapshot.status as DatabaseDeliveryStatus,
            version: snapshot.version,
          },
        });

        if (result.count !== 1) {
          throw new PersistenceConflictError('Delivery', snapshot.id);
        }

        if (snapshot.courierId !== undefined) {
          const current = await tx.courierAssignment.findFirst({
            where: { deliveryId: snapshot.id, active: true },
          });
          if (current === null) {
            await tx.courierAssignment.create({
              data: {
                id: randomUUID(),
                deliveryId: snapshot.id,
                courierId: snapshot.courierId,
              },
            });
          } else if (current.courierId !== snapshot.courierId) {
            throw new ActiveCourierAssignmentConflictError();
          }
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ActiveCourierAssignmentConflictError();
      }
      throw error;
    }
  }
}
