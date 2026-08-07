import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { OrderStatus } from '../../ordering/domain/order-status';
import { DomainError } from '../../shared/domain/domain-error';
import { Delivery } from './delivery';
import { DeliveryPin } from './delivery-pin';
import { DeliveryStatus } from './delivery-status';

function createDelivery(): Delivery {
  return Delivery.request({
    deliveryId: 'delivery-001',
    orderId: 'order-001',
    plainTextPin: '2486',
    expectedCashCents: 25_000,
  });
}

function assertDomainError(error: unknown, code: DomainError['code']): boolean {
  return error instanceof DomainError && error.code === code;
}

describe('DeliveryPin', () => {
  test('stores a hash and validates without exposing the plain PIN', () => {
    const pin = DeliveryPin.fromPlainText('2486');

    assert.notEqual(pin.toHash(), '2486');
    assert.equal(pin.matches('2486'), true);
    assert.equal(pin.matches('0000'), false);
    assert.equal(DeliveryPin.fromHash(pin.toHash()).matches('2486'), true);
  });
});

describe('Delivery', () => {
  test('executes the complete delivery happy path with canonical events', () => {
    const delivery = createDelivery();
    assert.deepEqual(
      delivery.pullDomainEvents().map((event) => event.name),
      ['DeliveryRequested'],
    );

    delivery.assignCourier('courier-001', delivery.version);
    delivery.startPickup('courier-001', OrderStatus.READY, delivery.version);
    delivery.confirmPickup({
      courierId: 'courier-001',
      orderStatus: OrderStatus.READY,
      expectedVersion: delivery.version,
      merchantResponsible: 'merchant-user-001',
      packageCount: 2,
    });
    delivery.startDelivery('courier-001', delivery.version);
    delivery.reportArrival('courier-001', delivery.version);
    delivery.confirmDelivery({
      courierId: 'courier-001',
      expectedVersion: delivery.version,
      pin: '2486',
      receiver: 'customer-001',
      cashReceivedCents: 25_000,
    });

    assert.equal(delivery.status, DeliveryStatus.DELIVERED);
    assert.deepEqual(
      delivery.pullDomainEvents().map((event) => event.name),
      [
        'CourierAssigned',
        'PickupStarted',
        'OrderPickedUp',
        'DeliveryStarted',
        'CourierArrived',
        'DeliveryCompleted',
      ],
    );
  });

  test('allows only one active courier assignment', () => {
    const delivery = createDelivery();
    delivery.assignCourier('courier-001', delivery.version);

    assert.throws(
      () => delivery.assignCourier('courier-002', delivery.version),
      (error) => assertDomainError(error, 'BUSINESS_RULE_VIOLATION'),
    );
  });

  test('rejects pickup before order is READY', () => {
    const delivery = createDelivery();
    delivery.assignCourier('courier-001', delivery.version);

    assert.throws(
      () => delivery.startPickup('courier-001', OrderStatus.PREPARING, delivery.version),
      (error) => assertDomainError(error, 'BUSINESS_RULE_VIOLATION'),
    );
  });

  test('rejects pickup and delivery by an unassigned courier', () => {
    const delivery = createDelivery();
    delivery.assignCourier('courier-001', delivery.version);

    assert.throws(
      () => delivery.startPickup('courier-002', OrderStatus.READY, delivery.version),
      (error) => assertDomainError(error, 'FORBIDDEN'),
    );
  });

  test('does not transfer custody twice', () => {
    const delivery = createDelivery();
    delivery.assignCourier('courier-001', delivery.version);
    delivery.startPickup('courier-001', OrderStatus.READY, delivery.version);
    delivery.confirmPickup({
      courierId: 'courier-001',
      orderStatus: OrderStatus.READY,
      expectedVersion: delivery.version,
      merchantResponsible: 'merchant-user-001',
      packageCount: 1,
    });

    const result = delivery.confirmPickup({
      courierId: 'courier-001',
      orderStatus: OrderStatus.READY,
      expectedVersion: 1,
      merchantResponsible: 'merchant-user-001',
      packageCount: 1,
    });

    assert.equal(result.changed, false);
    assert.equal(delivery.status, DeliveryStatus.PICKED_UP);
  });

  test('rejects an invalid PIN without completing delivery', () => {
    const delivery = createDelivery();
    delivery.assignCourier('courier-001', delivery.version);
    delivery.startPickup('courier-001', OrderStatus.READY, delivery.version);
    delivery.confirmPickup({
      courierId: 'courier-001',
      orderStatus: OrderStatus.READY,
      expectedVersion: delivery.version,
      merchantResponsible: 'merchant-user-001',
      packageCount: 1,
    });
    delivery.startDelivery('courier-001', delivery.version);
    delivery.reportArrival('courier-001', delivery.version);

    assert.throws(
      () =>
        delivery.confirmDelivery({
          courierId: 'courier-001',
          expectedVersion: delivery.version,
          pin: '0000',
          receiver: 'customer-001',
          cashReceivedCents: 25_000,
        }),
      (error) => assertDomainError(error, 'BUSINESS_RULE_VIOLATION'),
    );
    assert.equal(delivery.status, DeliveryStatus.ARRIVED);
  });

  test('rejects a stale version on a new transition', () => {
    const delivery = createDelivery();

    assert.throws(
      () => delivery.assignCourier('courier-001', 0),
      (error) => assertDomainError(error, 'VERSION_CONFLICT'),
    );
  });
});
