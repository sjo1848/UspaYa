import type { DatabaseOrderStatus } from '@uspaya/database';

import { Order, type OrderSnapshot } from '../domain/order';
import { OrderStatus } from '../domain/order-status';

export interface OrderPersistenceRecord {
  readonly id: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly status: DatabaseOrderStatus;
  readonly version: number;
}

export class OrderPersistenceMapper {
  static toDomain(record: OrderPersistenceRecord): Order {
    return Order.restore({
      id: record.id,
      branchId: record.branchId,
      customerId: record.customerId,
      status: record.status as OrderStatus,
      version: record.version,
    });
  }

  static toSnapshot(order: Order): OrderSnapshot {
    return order.toSnapshot();
  }
}
