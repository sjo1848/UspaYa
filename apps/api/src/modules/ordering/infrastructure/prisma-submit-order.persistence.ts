import { Prisma, type PrismaClient } from '@uspaya/database';

import type {
  SubmittedOrderGraph,
  SubmitOrderAuditEntry,
  SubmitOrderOutboxEntry,
  SubmitOrderPersistencePort,
  SubmitOrderProductSnapshot,
  SubmitOrderStoredIdempotency,
  SubmitOrderTransactionPort,
} from '../application/ports/submit-order.persistence.port';

const IDEMPOTENCY_SCOPE = 'SubmitOrder';

export class PrismaSubmitOrderPersistence implements SubmitOrderPersistencePort {
  constructor(private readonly prisma: PrismaClient) {}

  async runInSerializableTransaction<T>(
    work: (transaction: SubmitOrderTransactionPort) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (transaction) => work(new PrismaSubmitOrderTransaction(transaction)),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findIdempotency(key: string): Promise<SubmitOrderStoredIdempotency | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope: IDEMPOTENCY_SCOPE, key } },
      select: { requestHash: true, status: true, responseBody: true },
    });
    return record;
  }

  isRecoverableIdempotencyRace(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  isRetryableTransactionConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
  }
}

class PrismaSubmitOrderTransaction implements SubmitOrderTransactionPort {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async findIdempotency(key: string): Promise<SubmitOrderStoredIdempotency | null> {
    return this.transaction.idempotencyRecord.findUnique({
      where: { scope_key: { scope: IDEMPOTENCY_SCOPE, key } },
      select: { requestHash: true, status: true, responseBody: true },
    });
  }

  async createIdempotency(input: {
    readonly id: string;
    readonly key: string;
    readonly requestHash: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    await this.transaction.idempotencyRecord.create({
      data: {
        id: input.id,
        scope: IDEMPOTENCY_SCOPE,
        key: input.key,
        requestHash: input.requestHash,
        status: 'IN_PROGRESS',
        expiresAt: input.expiresAt,
      },
    });
  }

  async isActiveBranch(branchId: string): Promise<boolean> {
    return (
      (await this.transaction.branch.count({
        where: { id: branchId, active: true, merchant: { active: true } },
      })) === 1
    );
  }

  async isActiveCustomer(customerId: string): Promise<boolean> {
    return (
      (await this.transaction.user.count({
        where: { id: customerId, active: true },
      })) === 1
    );
  }

  async findActiveProducts(
    branchId: string,
    productIds: readonly string[],
  ): Promise<readonly SubmitOrderProductSnapshot[]> {
    return this.transaction.product.findMany({
      where: {
        id: { in: [...productIds] },
        branchId,
        active: true,
      },
      select: { id: true, sku: true, name: true, priceCents: true },
    });
  }

  async createSubmittedOrder(graph: SubmittedOrderGraph): Promise<void> {
    await this.transaction.order.create({
      data: {
        id: graph.order.id,
        branchId: graph.order.branchId,
        customerId: graph.order.customerId,
        status: graph.order.status,
        version: graph.order.version,
        totalCents: graph.order.totalCents,
        items: {
          create: graph.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            skuSnapshot: item.skuSnapshot,
            nameSnapshot: item.nameSnapshot,
            unitPriceCents: item.unitPriceCents,
            quantity: item.quantity,
            lineTotalCents: item.lineTotalCents,
          })),
        },
        payment: {
          create: {
            id: graph.payment.id,
            method: graph.payment.method,
            status: graph.payment.status,
            amountCents: graph.payment.amountCents,
            version: graph.payment.version,
          },
        },
        delivery: {
          create: {
            id: graph.delivery.id,
            status: graph.delivery.status,
            version: graph.delivery.version,
            expectedCashCents: graph.delivery.expectedCashCents,
            pinHash: graph.delivery.pinHash,
            destinationAddressText: graph.delivery.destination.addressText,
            destinationPhone: graph.delivery.destination.phone,
            destinationReference: graph.delivery.destination.reference,
            destinationLodging: graph.delivery.destination.lodging,
            destinationLatitude: graph.delivery.destination.latitude,
            destinationLongitude: graph.delivery.destination.longitude,
          },
        },
      },
    });
  }

  async appendAudit(entry: SubmitOrderAuditEntry): Promise<void> {
    await this.transaction.auditLog.create({
      data: {
        id: entry.id,
        actorId: entry.actorId,
        action: entry.action,
        aggregateType: entry.aggregateType,
        aggregateId: entry.aggregateId,
        aggregateVersion: entry.aggregateVersion,
        metadata: entry.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async appendOutbox(entries: readonly SubmitOrderOutboxEntry[]): Promise<void> {
    await this.transaction.outboxEvent.createMany({
      data: entries.map((entry) => ({
        id: entry.id,
        aggregateType: entry.aggregateType,
        aggregateId: entry.aggregateId,
        aggregateVersion: entry.aggregateVersion,
        eventName: entry.eventName,
        payload: entry.payload as Prisma.InputJsonValue,
      })),
    });
  }

  async completeIdempotency(input: {
    readonly key: string;
    readonly responseStatus: number;
    readonly responseBody: unknown;
    readonly completedAt: Date;
  }): Promise<void> {
    await this.transaction.idempotencyRecord.update({
      where: { scope_key: { scope: IDEMPOTENCY_SCOPE, key: input.key } },
      data: {
        status: 'COMPLETED',
        responseStatus: input.responseStatus,
        responseBody: input.responseBody as Prisma.InputJsonValue,
        completedAt: input.completedAt,
      },
    });
  }
}
