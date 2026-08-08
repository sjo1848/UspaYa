import { describe, expect, it } from 'vitest';

import { recoverAssignmentDecision, recoverCompletionDecision } from './recovery';

describe('operations recovery decisions', () => {
  it('confirms an uncertain assignment only when the selected courier owns it', () => {
    expect(
      recoverAssignmentDecision(
        { delivery: { status: 'ASSIGNED', courierId: 'courier-selected' } },
        'courier-selected',
      ),
    ).toBe('confirmed');
    expect(
      recoverAssignmentDecision(
        { delivery: { status: 'ASSIGNED', courierId: 'courier-other' } },
        'courier-selected',
      ),
    ).toBe('refresh-required');
  });

  it('allows a conscious assignment retry only while the delivery remains unassigned', () => {
    expect(
      recoverAssignmentDecision(
        { delivery: { status: 'PENDING_ASSIGNMENT', courierId: null } },
        'courier-selected',
      ),
    ).toBe('retryable');
    expect(
      recoverAssignmentDecision(
        { delivery: { status: 'PICKED_UP', courierId: 'courier-selected' } },
        'courier-selected',
      ),
    ).toBe('refresh-required');
  });

  it('recovers completion without inferring success from a network failure', () => {
    expect(recoverCompletionDecision({ status: 'COMPLETED' })).toBe('confirmed');
    expect(recoverCompletionDecision({ status: 'FULFILLED' })).toBe('retryable');
    expect(recoverCompletionDecision({ status: 'READY' })).toBe('refresh-required');
  });
});
