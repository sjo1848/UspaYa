import { randomUUID } from 'node:crypto';

import {
  DeliveryDestination,
  type DeliveryDestinationInput,
  type DeliveryDestinationSnapshot,
} from '../../delivery/domain/delivery-destination';
import { Delivery } from '../../delivery/domain/delivery';
import {
  createProtectedRequestHash,
  IdempotencyConflictError,
  protectedRequestHashMatches,
} from '../../shared/application/idempotency';
import { Order } from '../domain/order';
import type { SubmitOrderPersistencePort } from './ports/submit-order.persistence.port';

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
  readonly deliveryDestination: DeliveryDestinationInput;
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
    private readonly persistence: SubmitOrderPersistencePort,
    private readonly hooks: SubmitOrderHooks = {},
  ) {}

  async execute(command: SubmitOrderCommand): Promise<SubmitOrderResult> {
    const key = command.idempotencyKey.trim();
    if (key.length < 8 || key.length > 128) {
      throw new InvalidOrderSubmissionError('Idempotency key must contain 8 to 128 characters.');
    }

    const deliveryDestination = DeliveryDestination.create(command.deliveryDestination).toSnapshot();
    const fingerprintInput = createFingerprintInput(command, deliveryDestination);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.executeTransaction(
          command,
          key,
          fingerprintInput,
          deliveryDestination,
        );
      } catch (error) {
        if (!this.persistence.isRecoverableIdempotencyRace(error)) {
          throw error;
        }

        const recovered = await this.recoverConcurrentResult(
          key,
          fingerprintInput,
          command.plainTextPin,
        );
        if (recovered !== undefined) {
          return recovered;
        }

        if (attempt === 0 && this.persistence.isRetryableTransactionConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('SubmitOrder retry loop ended unexpectedly.');
  }

  private async executeTransaction(
    command: SubmitOrderCommand,
    key: string,
    fingerprintInput: SubmitOrderFingerprintInput,
    deliveryDestination: DeliveryDestinationSnapshot,
  ): Promise<SubmitOrderResult> {
    return this.persistence.runInSerializableTransaction(async (transaction) => {
      const existing = await transaction.findIdempotency(key);
      if (existing !== null) {
        if (
          !protectedRequestHashMatches(existing.requestHash, fingerprintInput, command.plainTextPin)
        ) {
          throw new IdempotencyConflictError();
        }
        if (existing.status !== 'COMPLETED') {
          throw new IdempotencyInProgressError();
        }
        return readStoredResult(existing.responseBody);
      }

      await transaction.createIdempotency({
        id: randomUUID(),
        key,
        requestHash: createProtectedRequestHash(fingerprintInput, command.plainTextPin),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const branchIsActive = await transaction.isActiveBranch(command.branchId);
      const customerIsActive = await transaction.isActiveCustomer(command.customerId);
      if (!branchIsActive || !customerIsActive) {
        throw new InvalidOrderSubmissionError('Branch or customer is not active.');
      }

      if (command.items.length === 0) {
        throw new InvalidOrderSubmissionError('Order must contain at least one item.');
      }
      const productIds = command.items.map((item) => item.productId);
      if (new Set(productIds).size !== productIds.length) {
        throw new InvalidOrderSubmissionError('Repeated products must be consolidated.');
      }

      const products = await transaction.findActiveProducts(command.branchId, productIds);
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

      await transaction.createSubmittedOrder({
        order: {
          id: orderSnapshot.id,
          branchId: orderSnapshot.branchId,
          customerId: orderSnapshot.customerId,
          status: 'PENDING_MERCHANT',
          version: orderSnapshot.version,
          totalCents,
        },
        items: itemRows,
        payment: {
          id: command.paymentId,
          method: 'CASH',
          status: 'PENDING',
          amountCents: totalCents,
          version: 1,
        },
        delivery: {
          id: deliverySnapshot.id,
          status: 'PENDING_ASSIGNMENT',
          version: deliverySnapshot.version,
          expectedCashCents: deliverySnapshot.expectedCashCents,
          pinHash: deliverySnapshot.pinHash,
          destination: deliveryDestination,
        },
      });

      await transaction.appendAudit({
        id: randomUUID(),
        actorId: command.customerId,
        action: 'SubmitOrder',
        aggregateType: 'Order',
        aggregateId: command.orderId,
        aggregateVersion: orderSnapshot.version,
        metadata: { branchId: command.branchId, totalCents },
      });

      this.hooks.afterOrderPersisted?.();

      await transaction.appendOutbox([
        ...orderEvents.map((event) => ({
          id: randomUUID(),
          aggregateType: 'Order' as const,
          aggregateId: event.aggregateId,
          aggregateVersion: event.aggregateVersion,
          eventName: event.name,
          payload: event.payload,
        })),
        ...deliveryEvents.map((event) => ({
          id: randomUUID(),
          aggregateType: 'Delivery' as const,
          aggregateId: event.aggregateId,
          aggregateVersion: event.aggregateVersion,
          eventName: event.name,
          payload: event.payload,
        })),
      ]);

      const result: SubmitOrderResult = {
        orderId: command.orderId,
        deliveryId: command.deliveryId,
        status: 'PENDING_MERCHANT',
        version: orderSnapshot.version,
        totalCents,
      };
      await transaction.completeIdempotency({
        key,
        responseStatus: 201,
        responseBody: result,
        completedAt: new Date(),
      });
      return result;
    });
  }

  private async recoverConcurrentResult(
    key: string,
    fingerprintInput: SubmitOrderFingerprintInput,
    plainTextPin: string,
  ): Promise<SubmitOrderResult | undefined> {
    const delaysMs = [0, 25, 75, 150] as const;

    for (const delayMs of delaysMs) {
      if (delayMs > 0) {
        await delay(delayMs);
      }

      const existing = await this.persistence.findIdempotency(key);
      if (existing === null) {
        continue;
      }
      if (!protectedRequestHashMatches(existing.requestHash, fingerprintInput, plainTextPin)) {
        throw new IdempotencyConflictError();
      }
      if (existing.status === 'COMPLETED') {
        return readStoredResult(existing.responseBody);
      }
    }

    const existing = await this.persistence.findIdempotency(key);
    if (existing !== null) {
      if (!protectedRequestHashMatches(existing.requestHash, fingerprintInput, plainTextPin)) {
        throw new IdempotencyConflictError();
      }
      throw new IdempotencyInProgressError();
    }
    return undefined;
  }
}

interface SubmitOrderFingerprintInput {
  readonly orderId: string;
  readonly deliveryId: string;
  readonly paymentId: string;
  readonly customerId: string;
  readonly branchId: string;
  readonly deliveryDestination: DeliveryDestinationSnapshot;
  readonly items: readonly SubmitOrderItemInput[];
}

function createFingerprintInput(
  command: SubmitOrderCommand,
  deliveryDestination: DeliveryDestinationSnapshot,
): SubmitOrderFingerprintInput {
  return {
    orderId: command.orderId,
    deliveryId: command.deliveryId,
    paymentId: command.paymentId,
    customerId: command.customerId,
    branchId: command.branchId,
    deliveryDestination,
    items: command.items,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readStoredResult(value: unknown): SubmitOrderResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored idempotency result is invalid.');
  }
  const record = value as Record<string, unknown>;
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
