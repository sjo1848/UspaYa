import type { DatabaseDeliveryStatus } from '@uspaya/database';

import { Delivery, type DeliverySnapshot } from '../domain/delivery';
import type { DeliveryStatus } from '../domain/delivery-status';

export interface DeliveryPersistenceRecord {
  readonly id: string;
  readonly orderId: string;
  readonly status: DatabaseDeliveryStatus;
  readonly version: number;
  readonly expectedCashCents: number;
  readonly pinHash: string;
  readonly assignments: readonly { readonly courierId: string }[];
}

export class DeliveryPersistenceMapper {
  static toDomain(record: DeliveryPersistenceRecord): Delivery {
    const courierId = record.assignments[0]?.courierId;
    return Delivery.restore({
      id: record.id,
      orderId: record.orderId,
      status: record.status as DeliveryStatus,
      version: record.version,
      expectedCashCents: record.expectedCashCents,
      pinHash: record.pinHash,
      ...(courierId === undefined ? {} : { courierId }),
    });
  }

  static toSnapshot(delivery: Delivery): DeliverySnapshot {
    return delivery.toSnapshot();
  }
}
