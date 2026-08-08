export type CourierDeliveryStatus =
  | 'ASSIGNED'
  | 'PICKUP_IN_PROGRESS'
  | 'PICKED_UP'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'DELIVERED';

export type CourierRecoveryDecision = 'confirmed' | 'retryable' | 'refresh-required';

const STATUS_ORDER: readonly CourierDeliveryStatus[] = [
  'ASSIGNED',
  'PICKUP_IN_PROGRESS',
  'PICKED_UP',
  'ON_THE_WAY',
  'ARRIVED',
  'DELIVERED',
];

export function recoverCourierTransitionDecision(
  observedStatus: string,
  sourceStatus: CourierDeliveryStatus,
  targetStatus: CourierDeliveryStatus,
): CourierRecoveryDecision {
  if (observedStatus === sourceStatus) return 'retryable';

  const observedIndex = STATUS_ORDER.indexOf(observedStatus as CourierDeliveryStatus);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (observedIndex >= targetIndex && targetIndex >= 0) return 'confirmed';

  return 'refresh-required';
}
