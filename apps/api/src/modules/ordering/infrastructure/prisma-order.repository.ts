import type {
  DatabaseOrderStatus,
  PrismaClient,
} from '@uspaya/database';

import { PersistenceConflictError } from '../../shared/infrastructure/persistence-errors';
import type { Order } from '../domain/order';
import { OrderPersistenceMapper } from './order-persistence.mapper';

export class PrismaOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({ where: { id } });
    return record === null ? null : OrderPersistenceMapper.toDomain(record);
  }

  async save(order: Order, persistedVersion: number): Promise<void> {
    const snapshot = OrderPersistenceMapper.toSnapshot(order);
    const result = await this.prisma.order.updateMany({
      where: { id: snapshot.id, version: persistedVersion },
      data: {
        status: snapshot.status as DatabaseOrderStatus,
        version: snapshot.version,
      },
    });

    if (result.count !== 1) {
      throw new PersistenceConflictError('Order', snapshot.id);
    }
  }
}
