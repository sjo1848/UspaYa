export type RecoveryDecision = 'confirmed' | 'retryable' | 'refresh-required';

export interface AssignmentRecoveryProjection {
  readonly delivery: null | {
    readonly status: string;
    readonly courierId: string | null;
  };
}

export interface CompletionRecoveryProjection {
  readonly status: string;
}

export function recoverAssignmentDecision(
  order: AssignmentRecoveryProjection,
  expectedCourierId: string,
): RecoveryDecision {
  if (order.delivery?.status === 'ASSIGNED' && order.delivery.courierId === expectedCourierId) {
    return 'confirmed';
  }
  if (
    order.delivery?.status === 'PENDING_ASSIGNMENT' &&
    (order.delivery.courierId === null || order.delivery.courierId === undefined)
  ) {
    return 'retryable';
  }
  return 'refresh-required';
}

export function recoverCompletionDecision(order: CompletionRecoveryProjection): RecoveryDecision {
  if (order.status === 'COMPLETED') return 'confirmed';
  if (order.status === 'FULFILLED') return 'retryable';
  return 'refresh-required';
}
