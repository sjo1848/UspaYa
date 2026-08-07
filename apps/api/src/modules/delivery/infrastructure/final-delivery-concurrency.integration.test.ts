import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { closePrismaClient, getPrismaClient } from '@uspaya/database';

import { SubmitOrderService } from '../../ordering/application/submit-order.service';
import { ConfirmDeliveryService } from '../application/confirm-delivery.service';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const PIN = '4826';
const prisma = getPrismaClient();

test('concurrent final-delivery retries with one key produce one financial result', async (context) => {
  context.after(async () => closePrismaClient());

  const courierId = randomUUID();
  await prisma.user.create({
    data: {
      id: courierId,
      email: `concurrent-final-${courierId}@uspaya.test`,
      displayName: 'Synthetic concurrent final courier',
      roleAssignments: { create: { id: randomUUID(), role: 'COURIER' } },
    },
  });

  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const paymentId = randomUUID();
  const submit = new SubmitOrderService(prisma);
  const submitted = await submit.execute({
    idempotencyKey: `concurrent-final-submit-${randomUUID()}`,
    orderId,
    deliveryId,
    paymentId,
    customerId: CUSTOMER_ID,
    branchId: BRANCH_ID,
    plainTextPin: PIN,
    items: [{ itemId: randomUUID(), productId: PRODUCT_ID, quantity: 1 }],
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'READY', version: 5 },
  });
  await prisma.delivery.update({
    where: { id: deliveryId },
    data: { status: 'ARRIVED', version: 6 },
  });
  await prisma.courierAssignment.create({
    data: {
      id: randomUUID(),
      deliveryId,
      courierId,
      active: true,
    },
  });

  const key = `concurrent-final-${randomUUID()}`;
  const service = new ConfirmDeliveryService(prisma);
  const command = {
    idempotencyKey: key,
    deliveryId,
    actorId: courierId,
    expectedVersion: 6,
    pin: PIN,
    receiver: 'Cliente receptor',
    cashReceivedCents: submitted.totalCents,
  } as const;

  const [first, second] = await Promise.all([service.execute(command), service.execute(command)]);
  assert.deepEqual(second, first);
  assert.equal(first.deliveryStatus, 'DELIVERED');
  assert.equal(first.paymentStatus, 'CONFIRMED');
  assert.equal(first.orderStatus, 'FULFILLED');

  assert.equal(
    await prisma.idempotencyRecord.count({
      where: { scope: 'ConfirmDelivery', key },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: {
        OR: [
          { aggregateId: deliveryId, action: 'ConfirmDelivery' },
          { aggregateId: paymentId, action: 'ConfirmPayment' },
          { aggregateId: orderId, action: 'MarkOrderFulfilled' },
          { aggregateId: deliveryId, action: 'ReleaseCourierAssignment' },
        ],
      },
    }),
    4,
  );
  assert.equal(
    await prisma.outboxEvent.count({
      where: {
        OR: [
          { aggregateId: deliveryId, eventName: 'DeliveryCompleted' },
          { aggregateId: paymentId, eventName: 'PaymentConfirmed' },
          { aggregateId: orderId, eventName: 'OrderFulfilled' },
          { aggregateId: deliveryId, eventName: 'CourierAssignmentReleased' },
        ],
      },
    }),
    4,
  );
  assert.equal(
    await prisma.courierAssignment.count({ where: { deliveryId, courierId, active: true } }),
    0,
  );
});
