import { ApiClient, type OrderProjectionResponse } from './client';

export interface OperationsDeliveryQueueItem {
  readonly id: string;
  readonly orderId: string;
  readonly status: 'PENDING_ASSIGNMENT';
  readonly version: number;
  readonly expectedCashCents: number;
  readonly orderTotalCents: number;
  readonly orderCreatedAt: string;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
}

export interface OperationsUnassignedDeliveriesResponse {
  readonly deliveries: readonly OperationsDeliveryQueueItem[];
}

export interface AvailableCourierResponse {
  readonly courierId: string;
  readonly displayName: string;
}

export interface AssignCourierResponse {
  readonly deliveryId: string;
  readonly orderId: string;
  readonly courierId: string;
  readonly status: 'ASSIGNED';
  readonly version: number;
  readonly changed: boolean;
}

export interface PendingCompletionOrderResponse {
  readonly orderId: string;
  readonly version: number;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: 'CONFIRMED';
  readonly deliveryStatus: 'DELIVERED';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompleteOrderResponse {
  readonly orderId: string;
  readonly status: 'COMPLETED';
  readonly version: number;
  readonly changed: boolean;
}

export interface OrderAuditEntryResponse {
  readonly action: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number | null;
  readonly actorId: string | null;
  readonly metadata: unknown;
  readonly createdAt: string;
}

export interface OrderAuditResponse {
  readonly orderId: string;
  readonly entries: readonly OrderAuditEntryResponse[];
}

export class OperationsApi {
  constructor(private readonly api = new ApiClient()) {}

  listUnassigned(
    actorId: string,
    signal?: AbortSignal,
  ): Promise<OperationsUnassignedDeliveriesResponse> {
    return this.api.request<OperationsUnassignedDeliveriesResponse>(
      '/operations/deliveries/unassigned',
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  listAvailableCouriers(
    actorId: string,
    signal?: AbortSignal,
  ): Promise<readonly AvailableCourierResponse[]> {
    return this.api.request<readonly AvailableCourierResponse[]>(
      '/operations/couriers/available',
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  assignCourier(
    actorId: string,
    deliveryId: string,
    courierId: string,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<AssignCourierResponse> {
    return this.api.request<AssignCourierResponse>(
      `/operations/deliveries/${encodeURIComponent(deliveryId)}/assign`,
      {
        method: 'POST',
        actorId,
        body: { courierId, expectedVersion },
        ...(signal === undefined ? {} : { signal }),
      },
    );
  }

  listPendingCompletion(
    actorId: string,
    signal?: AbortSignal,
  ): Promise<readonly PendingCompletionOrderResponse[]> {
    return this.api.request<readonly PendingCompletionOrderResponse[]>(
      '/operations/orders/pending-completion',
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  completeOrder(
    actorId: string,
    orderId: string,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<CompleteOrderResponse> {
    return this.api.request<CompleteOrderResponse>(
      `/operations/orders/${encodeURIComponent(orderId)}/complete`,
      {
        method: 'POST',
        actorId,
        body: { expectedVersion },
        ...(signal === undefined ? {} : { signal }),
      },
    );
  }

  getOrder(actorId: string, orderId: string, signal?: AbortSignal): Promise<OrderProjectionResponse> {
    return this.api.getOrder(actorId, orderId, signal);
  }

  auditOrder(actorId: string, orderId: string, signal?: AbortSignal): Promise<OrderAuditResponse> {
    return this.api.request<OrderAuditResponse>(
      `/operations/orders/${encodeURIComponent(orderId)}/audit`,
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }
}
