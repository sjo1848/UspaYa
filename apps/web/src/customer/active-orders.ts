import type { ApiClient } from '@/api/client';

export type CustomerActiveOrderStatus =
  | 'SUBMITTED'
  | 'PENDING_MERCHANT'
  | 'CHANGE_PROPOSED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'FULFILLED'
  | 'CANCELLATION_REQUESTED';

export interface CustomerActiveOrderResponse {
  readonly orderId: string;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
  readonly status: CustomerActiveOrderStatus;
  readonly version: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: string | null;
  readonly deliveryStatus: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function listCustomerActiveOrders(
  api: ApiClient,
  actorId: string,
  signal?: AbortSignal,
): Promise<readonly CustomerActiveOrderResponse[]> {
  return api.request<readonly CustomerActiveOrderResponse[]>(
    '/customer/orders/active',
    signal === undefined ? { actorId } : { actorId, signal },
  );
}
