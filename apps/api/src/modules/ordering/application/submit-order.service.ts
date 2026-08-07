import { randomUUID } from 'node:crypto';

import {
  createRequestHash,
  IdempotencyConflictError,
  Prisma,
  type PrismaClient,
} from '@uspaya/database';

import { Delivery } from '../../delivery/domain/delivery';
import { Order } from '../domain/order';

export interface SubmitOrderItemInput {
  readonly itemId: string;
  readonly productId: string;
  readonly quantity: number;
}

export interface SubmitOrderCommand {
  readonly idempotencyKey: string;
  readonly orderId: string;
  readonly deliveryId: string;
  readonly paymentId: string;
  readonly customerId: string;
  readonly branchId: string;
  readonly plainTextPin: string;
  readonly items: readonly SubmitOrderItemInput[];
}

export interface SubmitOrderResult {
  readonly orderId: string;
  readonly deliveryId: string;
  readonly status: 'PENDING_MERCHANT';
  readonly version: number;
  readonly totalCents: number;
}

export interface SubmitOrderHooks {
  readonly afterOrderPersisted?: () => void;
}

export class InvalidOrderSubmissionError extends Error {
  readonly code = 'INVALID_ORDER_SUBMISSION';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderSubmissionError';
  }
}

export class IdempotencyInProgressError extends Error {
  readonly code = 'IDEMPOTENCY_OPERATION_IN_PROGRESS';

  constructor() {
    super('An operation with this idempotency key is already in progress.');
    this.name = 'IdempotencyInProgressError';
  }
}

export class SubmitOrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hooks: SubmitOrderHooks = {},
  ) {}

  async execute(command: SubmitOrderCommand): Promise<SubmitOrderResult> {
    const key = command.idempotencyKey.trim();
    if (key.length < 8 || key.length > 128) {
      throw new InvalidOrderSubmissionError('Idempotency key must contain 8 to 128 characters.');
    }

    const requestHash = createRequestHash({
      orderId: command.orderId,
      deliveryId: command.deliveryId,
      paymentId: command.paymentId,
      customerId: command.customerId,
      branchId: command.branchId,
      plainTextPin: command.plainTextPin,
      items: command.items,
    });

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({
          where: { scope_key: { scope: 'SubmitOrder', key } },
        });
        if (existing !== null) {
          if (existing.requestHash !== requestHash) {
            throw new IdempotencyConflictError();
          }
          if (existing.status !== 'COMPLETED') {
            throw new IdempotencyInProgressError();
          }
          return readStoredResult(existing.responseBody);
        }

        await tx.idempotencyRecord.create({
          data: {
            id: randomUUID(),
            scope: 'SubmitOrder',
            key,
            requestHash,
            status: 'IN_PROGRESS',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        const branch = await tx.branch.findFirst({
          where: { id: command.branchId, active: true, merchant: { active: true } },
        });
        const customer = await tx.user.findFirst({
          where: { id: command.customerId, active: true },
        });
        if (branch === null || customer === null) {
          throw new InvalidOrderSubmissionError('Branch or customer is not active.');
        }

        if (command.items.length === 0) {
          throw new InvalidOrderSubmissionError('Order must contain at least one item.');
        }
        const productIds = command.items.map((item) => item.productId);
        if (new Set(productIds).size !== productIds.length) {
          throw new InvalidOrderSubmissionError('Repeated products must be consolidated.');
        }

        const products = await tx.product.findMany({
          where: {
            id: { in: productIds },
            branchId: command.branchId,
            active: true,
          },
        });
        if (products.length !== command.items.length) {
          throw new InvalidOrderSubmissionError('One or more products are unavailable.');
        }

        const productById = new Map(products.map((product) => [product.id, product]));
        const itemRows = command.items.map((item) => {
          if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
            throw new InvalidOrderSubmissionError('Item quantity must be a positive integer.');
          }
          const product = productById.get(item.productId);
          if (product === undefined) {
            throw new InvalidOrderSubmissionError('Product snapshot could not be created.');
          }
          const lineTotalCents = product.priceCents * item.quantity;
          if (!Number.isSafeInteger(lineTotalCents)) {
            throw new InvalidOrderSubmissionError('Order amount exceeds the supported range.');
          }
          return {
            id: item.itemId,
            productId: product.id,
            skuSnapshot: product.sku,
            nameSnapshot: product.name,
            unitPriceCents: product.priceCents,
            quantity: item.quantity,
            lineTotalCents,
          };
        });
        const totalCents = itemRows.reduce((total, item) => total + item.lineTotalCents, 0);

        const order = Order.submit({
          orderId: command.orderId,
          branchId: command.branchId,
          customerId: command.customerId,
        });
        const orderEvents = order.pullDomainEvents();
        order.sendToMerchant(order.version);
        const orderSnapshot = order.toSnapshot();

        const delivery = Delivery.request({
          deliveryId: command.deliveryId,
          orderId: command.orderId,
          plainTextPin: command.plainTextPin,
          expectedCashCents: totalCents,
        });
        const deliveryEvents = delivery.pullDomainEvents();
        const deliverySnapshot = delivery.toSnapshot();

        await tx.order.create({
          data: {
            id: orderSnapshot.id,
            branchId: orderSnapshot.branchId,
            customerId: orderSnapshot.customerId,
            status: 'PENDING_MERCHANT',
            version: orderSnapshot.version,
            totalCents,
            items: { create: itemRows },
            payment: {
              create: {
                id: command.paymentId,
                method: 'CASH',
                status: 'PENDING',
                amountCents: totalCents,
                version: 1,
              },
            },
            delivery: {
              create: {
                id: deliverySnapshot.id,
                status: 'PENDING_ASSIGNMENT',
                version: deliverySnapshot.version,
                expectedCashCents: deliverySnapshot.expectedCashCents,
                pinHash: deliverySnapshot.pinHash,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: command.customerId,
            action: 'SubmitOrder',
            aggregateType: 'Order',
            aggregateId: command.orderId,
            aggregateVersion: orderSnapshot.version,
            metadata: { branchId: command.branchId, totalCents },
          },
        });

        this.hooks.afterOrderPersisted?.();

        const outboxRows = [...orderEvents, ...deliveryEvents].map((event) => ({
          id: randomUUID(),
          aggregateType: event.name.startsWith('Order') ? 'Order' : 'Delivery',
          aggregateId: event.aggregateId,
          aggregateVersion: event.aggregateVersion,
          eventName: event.name,
          payload: event.payload as Prisma.InputJsonValue,
        }));
        await tx.outboxEvent.createMany({ data: outboxRows });

        const result: SubmitOrderResult = {
          orderId: command.orderId,
          deliveryId: command.deliveryId,
          status: 'PENDING_MERCHANT',
          version: orderSnapshot.version,
          totalCents,
        };
        await tx.idempotencyRecord.update({
          where: { scope_key: { scope: 'SubmitOrder', key } },
          data: {
            status: 'COMPLETED',
            responseStatus: 201,
            responseBody: {
              orderId: result.orderId,
              deliveryId: result.deliveryId,
              status: result.status,
              version: result.version,
              totalCents: result.totalCents,
            },
            completedAt: new Date(),
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function readStoredResult(value: Prisma.JsonValue | null): SubmitOrderResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored idempotency result is invalid.');
  }
  const record = value as Record<string, Prisma.JsonValue>;
  if (
    typeof record.orderId !== 'string' ||
    typeof record.deliveryId !== 'string' ||
    record.status !== 'PENDING_MERCHANT' ||
    typeof record.version !== 'number' ||
    typeof record.totalCents !== 'number'
  ) {
    throw new Error('Stored idempotency result is incomplete.');
  }
  return {
    orderId: record.orderId,
    deliveryId: record.deliveryId,
    status: 'PENDING_MERCHANT',
    version: record.version,
    totalCents: record.totalCents,
  };
}
