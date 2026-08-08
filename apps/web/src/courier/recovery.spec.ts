import { describe, expect, it } from 'vitest';

import { recoverCourierTransitionDecision } from './recovery';

describe('recoverCourierTransitionDecision', () => {
  it('confirms the requested transition when the observed state reached or passed the target', () => {
    expect(
      recoverCourierTransitionDecision('PICKUP_IN_PROGRESS', 'ASSIGNED', 'PICKUP_IN_PROGRESS'),
    ).toBe('confirmed');
    expect(recoverCourierTransitionDecision('ON_THE_WAY', 'PICKED_UP', 'ON_THE_WAY')).toBe(
      'confirmed',
    );
    expect(recoverCourierTransitionDecision('ARRIVED', 'PICKED_UP', 'ON_THE_WAY')).toBe(
      'confirmed',
    );
  });

  it('allows a conscious retry only when the authoritative state remains at the source', () => {
    expect(recoverCourierTransitionDecision('ASSIGNED', 'ASSIGNED', 'PICKUP_IN_PROGRESS')).toBe(
      'retryable',
    );
  });

  it('requires refresh or operator review for an unexpected state', () => {
    expect(
      recoverCourierTransitionDecision('PENDING_ASSIGNMENT', 'ASSIGNED', 'PICKUP_IN_PROGRESS'),
    ).toBe('refresh-required');
  });
});
