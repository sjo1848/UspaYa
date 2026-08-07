export interface ApiErrorBody {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly correlationId?: unknown;
  readonly details?: unknown;
}

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly actorId?: string;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface HealthResponse {
  readonly status: string;
}

export interface ActorScope {
  readonly merchantId?: string;
  readonly branchId?: string;
}

export interface CurrentActorResponse {
  readonly userId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly scopes: readonly ActorScope[];
}

export interface CatalogBranchResponse {
  readonly merchantId: string;
  readonly merchantName: string;
  readonly branchId: string;
  readonly branchName: string;
}

export interface CatalogProductResponse {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly priceCents: number;
  readonly currency: 'ARS';
}

export interface BranchCatalogResponse {
  readonly branch: {
    readonly id: string;
    readonly merchantId: string;
    readonly name: string;
  };
  readonly products: readonly CatalogProductResponse[];
}

export interface SubmitOrderItemRequest {
  readonly itemId: string;
  readonly productId: string;
  readonly quantity: number;
}

export interface SubmitOrderRequest {
  readonly orderId: string;
  readonly deliveryId: string;
  readonly paymentId: string;
  readonly branchId: string;
  readonly deliveryPin: string;
  readonly items: readonly SubmitOrderItemRequest[];
}

export interface SubmitOrderResponse {
  readonly orderId: string;
  readonly deliveryId: string;
  readonly status: 'PENDING_MERCHANT';
  readonly version: number;
  readonly totalCents: number;
}

export type MerchantInboxOrderStatus = 'PENDING_MERCHANT' | 'ACCEPTED' | 'PREPARING' | 'READY';

export interface MerchantInboxOrderResponse {
  readonly orderId: string;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
  readonly status: MerchantInboxOrderStatus;
  readonly version: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: string | null;
  readonly deliveryStatus: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MerchantOrderTransitionResponse {
  readonly orderId: string;
  readonly status: string;
  readonly version: number;
  readonly changed: boolean;
}

export interface OrderProjectionResponse {
  readonly id: string;
  readonly status: string;
  readonly version: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly branch: {
    readonly id: string;
    readonly merchantId: string;
    readonly name: string;
  };
  readonly items: readonly {
    readonly id: string;
    readonly productId: string | null;
    readonly sku: string;
    readonly name: string;
    readonly unitPriceCents: number;
    readonly quantity: number;
    readonly lineTotalCents: number;
  }[];
  readonly payment: null | {
    readonly id: string;
    readonly method: string;
    readonly status: string;
    readonly amountCents: number;
    readonly version: number;
  };
  readonly delivery: null | {
    readonly id: string;
    readonly status: string;
    readonly version: number;
    readonly courierId: string | null;
  };
}

export class ApiHttpError extends Error {
  readonly kind = 'http';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId: string | null,
    readonly details: unknown,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export class ApiNetworkError extends Error {
  readonly kind = 'network';

  constructor(message = 'No se pudo conectar con UspaYa.') {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl = '/api/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health', signal === undefined ? {} : { signal });
  }

  currentActor(actorId: string, signal?: AbortSignal): Promise<CurrentActorResponse> {
    return this.request<CurrentActorResponse>(
      '/actors/me',
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  listCatalogBranches(
    actorId: string,
    signal?: AbortSignal,
  ): Promise<readonly CatalogBranchResponse[]> {
    return this.request<readonly CatalogBranchResponse[]>(
      '/catalog/branches',
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  getBranchCatalog(
    actorId: string,
    branchId: string,
    signal?: AbortSignal,
  ): Promise<BranchCatalogResponse> {
    return this.request<BranchCatalogResponse>(
      `/catalog/branches/${encodeURIComponent(branchId)}/products`,
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  submitOrder(
    actorId: string,
    idempotencyKey: string,
    body: SubmitOrderRequest,
    signal?: AbortSignal,
  ): Promise<SubmitOrderResponse> {
    return this.request<SubmitOrderResponse>('/orders', {
      method: 'POST',
      actorId,
      idempotencyKey,
      body,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  getOrder(
    actorId: string,
    orderId: string,
    signal?: AbortSignal,
  ): Promise<OrderProjectionResponse> {
    return this.request<OrderProjectionResponse>(
      `/orders/${encodeURIComponent(orderId)}`,
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  listMerchantInbox(
    actorId: string,
    signal?: AbortSignal,
  ): Promise<readonly MerchantInboxOrderResponse[]> {
    return this.request<readonly MerchantInboxOrderResponse[]>(
      '/merchant/orders',
      signal === undefined ? { actorId } : { actorId, signal },
    );
  }

  acceptOrder(
    actorId: string,
    orderId: string,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<MerchantOrderTransitionResponse> {
    return this.merchantOrderTransition(actorId, orderId, 'accept', expectedVersion, signal);
  }

  startOrderPreparation(
    actorId: string,
    orderId: string,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<MerchantOrderTransitionResponse> {
    return this.merchantOrderTransition(
      actorId,
      orderId,
      'start-preparation',
      expectedVersion,
      signal,
    );
  }

  markOrderReady(
    actorId: string,
    orderId: string,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<MerchantOrderTransitionResponse> {
    return this.merchantOrderTransition(actorId, orderId, 'ready', expectedVersion, signal);
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers({ accept: 'application/json' });
    if (options.actorId !== undefined) {
      headers.set('x-dev-actor-id', options.actorId);
    }
    if (options.idempotencyKey !== undefined) {
      headers.set('Idempotency-Key', options.idempotencyKey);
    }
    if (options.correlationId !== undefined) {
      headers.set('x-correlation-id', options.correlationId);
    }
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
    }

    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, requestInit);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      throw new ApiNetworkError();
    }

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new ApiHttpError(
        response.status,
        stringOr(body.code, 'HTTP_ERROR'),
        stringOr(body.message, `La solicitud falló con estado ${response.status}.`),
        nullableString(body.correlationId) ?? response.headers.get('x-correlation-id'),
        body.details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private merchantOrderTransition(
    actorId: string,
    orderId: string,
    action: 'accept' | 'start-preparation' | 'ready',
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<MerchantOrderTransitionResponse> {
    return this.request<MerchantOrderTransitionResponse>(
      `/orders/${encodeURIComponent(orderId)}/${action}`,
      {
        method: 'POST',
        actorId,
        body: { expectedVersion },
        ...(signal === undefined ? {} : { signal }),
      },
    );
  }
}

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const value = (await response.json()) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
