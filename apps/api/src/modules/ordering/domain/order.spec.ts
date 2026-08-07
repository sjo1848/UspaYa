import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DomainError } from '../../shared/domain/domain-error';
import { OrderStatus } from './order-status';
import { Order } from './order';

function createOrder(): Order {
  return Order.submit({
    orderId: 'order-001',
    branchId: 'branch-001',
    customerId: 'customer-001',
  });
}

function assertDomainError(error: unknown, code: DomainError['code']): boolean {
  return error instanceof DomainError && error.code === code;
}

describe('Order', () => {
  test('executes the complete happy path with canonical events', () => {
    const order = createOrder();
    assert.equal(order.status, OrderStatus.SUBMITTED);
    assert.deepEqual(
      order.pullDomainEvents().map((event) => event.name),
      ['OrderSubmitted'],
    );

    order.sendToMerchant(order.version);
    order.accept('branch-001', order.version);
    order.startPreparation('branch-001', order.version);
    order.markReady('branch-001', order.version);
    order.markFulfilled(order.version, 'delivery-001');
    order.complete(order.version);

    assert.equal(order.status, OrderStatus.COMPLETED);
    assert.deepEqual(
      order.pullDomainEvents().map((event) => event.name),
      [
        'OrderAccepted',
        'OrderPreparationStarted',
        'OrderReady',
        'OrderFulfilled',
        'OrderCompleted',
      ],
    );
  });

  test('rejects a mutation from a different branch', () => {
    const order = createOrder();
    order.sendToMerchant(order.version);

    assert.throws(
      () => order.accept('branch-other', order.version),
      (error) => assertDomainError(error, 'FORBIDDEN'),
    );
  });

  test('rejects a stale expected version', () => {
    const order = createOrder();
    order.sendToMerchant(order.version);

    assert.throws(
      () => order.accept('branch-001', 1),
      (error) => assertDomainError(error, 'VERSION_CONFLICT'),
    );
  });

  test('rejects preparation before acceptance', () => {
    const order = createOrder();
    order.sendToMerchant(order.version);

    assert.throws(
      () => order.startPreparation('branch-001', order.version),
      (error) => assertDomainError(error, 'INVALID_STATE'),
    );
  });

  test('treats a repeated accepted command as idempotent after progress', () => {
    const order = createOrder();
    order.sendToMerchant(order.version);
    order.accept('branch-001', order.version);
    order.startPreparation('branch-001', order.version);

    const result = order.accept('branch-001', 1);

    assert.equal(result.changed, false);
    assert.equal(order.status, OrderStatus.PREPARING);
  });
});
