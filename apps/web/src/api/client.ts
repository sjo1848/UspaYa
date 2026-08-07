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
    return this.request<HealthResponse>('/health', { signal });
  }

  currentActor(actorId: string, signal?: AbortSignal): Promise<CurrentActorResponse> {
    return this.request<CurrentActorResponse>('/actors/me', { actorId, signal });
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

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
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
