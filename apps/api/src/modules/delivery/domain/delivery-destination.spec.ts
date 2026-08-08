import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DomainError } from '../../shared/domain/domain-error';
import { DeliveryDestination } from './delivery-destination';

function assertInvalidValue(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'INVALID_VALUE';
}

describe('DeliveryDestination', () => {
  test('normalizes and freezes the snapshot values used by a new delivery', () => {
    const destination = DeliveryDestination.create({
      addressText: '  Av. Las Heras 120  ',
      phone: '  +54 9 261 555 0101  ',
      reference: '  Portón azul  ',
      lodging: '   ',
      latitude: -32.593,
      longitude: -69.349,
    });

    assert.deepEqual(destination.toSnapshot(), {
      addressText: 'Av. Las Heras 120',
      phone: '+54 9 261 555 0101',
      reference: 'Portón azul',
      lodging: null,
      latitude: -32.593,
      longitude: -69.349,
    });
    assert.equal(Object.isFrozen(destination.toSnapshot()), true);
  });

  test('rejects blank required values after trimming', () => {
    assert.throws(
      () => DeliveryDestination.create({ addressText: '   ', phone: '123456' }),
      assertInvalidValue,
    );
  });

  test('rejects partial coordinates', () => {
    assert.throws(
      () =>
        DeliveryDestination.create({
          addressText: 'Av. Las Heras 120',
          phone: '123456',
          latitude: -32.593,
        }),
      assertInvalidValue,
    );
  });

  test('rejects coordinates outside geographic ranges', () => {
    assert.throws(
      () =>
        DeliveryDestination.create({
          addressText: 'Av. Las Heras 120',
          phone: '123456',
          latitude: -91,
          longitude: -69.349,
        }),
      assertInvalidValue,
    );
  });
});
