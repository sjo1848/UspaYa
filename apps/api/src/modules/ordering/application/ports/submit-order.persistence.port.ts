export interface SubmitOrderStoredIdempotency {
  readonly requestHash: string;
  readonly status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  readonly responseBody: unknown;
}

export interface SubmitOrderProductSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly priceCents: number;
}

export interface SubmittedOrderItemRow {
  readonly id: string;
  readonly productId: string;
  readonly skuSnapshot: string;
  readonly nameSnapshot: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

export interface SubmittedOrderGraph {
  readonly order: {
    readonly id: string;
    readonly branchId: string;
    readonly customerId: string;
    readonly status: 'PENDING_MERCHANT';
    readonly version: number;
    readonly totalCents: number;
  };
  readonly items: readonly SubmittedOrderItemRow[];
  readonly payment: {
    readonly id: string;
    readonly method: 'CASH';
    readonly status: 'PENDING';
    readonly amountCents: number;
    readonly version: number;
  };
  readonly delivery: {
    readonly id: string;
    readonly status: 'PENDING_ASSIGNMENT';
    readonly version: number;
    readonly expectedCashCents: number;
    readonly pinHash: string;
    readonly destination: {
      readonly addressText: string;
      readonly phone: string;
      readonly reference: string | null;
      readonly lodging: string | null;
      readonly latitude: number | null;
      readonly longitude: number | null;
    };
  };
}

export interface SubmitOrderAuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly action: 'SubmitOrder';
  readonly aggregateType: 'Order';
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SubmitOrderOutboxEntry {
  readonly id: string;
  readonly aggregateType: 'Order' | 'Delivery';
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly eventName: string;
  readonly payload: unknown;
}

export interface SubmitOrderTransactionPort {
  findIdempotency(key: string): Promise<SubmitOrderStoredIdempotency | null>;
  createIdempotency(input: {
    readonly id: string;
    readonly key: string;
    readonly requestHash: string;
    readonly expiresAt: Date;
  }): Promise<void>;
  isActiveBranch(branchId: string): Promise<boolean>;
  isActiveCustomer(customerId: string): Promise<boolean>;
  findActiveProducts(
    branchId: string,
    productIds: readonly string[],
  ): Promise<readonly SubmitOrderProductSnapshot[]>;
  createSubmittedOrder(graph: SubmittedOrderGraph): Promise<void>;
  appendAudit(entry: SubmitOrderAuditEntry): Promise<void>;
  appendOutbox(entries: readonly SubmitOrderOutboxEntry[]): Promise<void>;
  completeIdempotency(input: {
    readonly key: string;
    readonly responseStatus: number;
    readonly responseBody: unknown;
    readonly completedAt: Date;
  }): Promise<void>;
}

export interface SubmitOrderPersistencePort {
  runInSerializableTransaction<T>(
    work: (transaction: SubmitOrderTransactionPort) => Promise<T>,
  ): Promise<T>;
  findIdempotency(key: string): Promise<SubmitOrderStoredIdempotency | null>;
  isRecoverableIdempotencyRace(error: unknown): boolean;
  isRetryableTransactionConflict(error: unknown): boolean;
}
