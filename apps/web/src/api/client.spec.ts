import { describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiNetworkError } from './client';
import type { ApiHttpError } from './client';

describe('ApiClient', () => {
  it('sends actor, correlation and idempotency headers without leaking them into the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new ApiClient('/api/v1', fetchMock);

    await client.request<{ ok: boolean }>('/orders', {
      method: 'POST',
      actorId: 'actor-1',
      correlationId: 'correlation-123',
      idempotencyKey: 'intent-12345678',
      body: { value: 1 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/orders');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-dev-actor-id')).toBe('actor-1');
    expect(headers.get('x-correlation-id')).toBe('correlation-123');
    expect(headers.get('Idempotency-Key')).toBe('intent-12345678');
    expect(init?.body).toBe(JSON.stringify({ value: 1 }));
  });

  it('preserves stable API error data and correlationId', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'VERSION_CONFLICT',
          message: 'The resource changed.',
          correlationId: 'corr-version-1',
          details: { expectedVersion: 3 },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new ApiClient('/api/v1', fetchMock);

    await expect(client.request('/orders/1')).rejects.toMatchObject<ApiHttpError>({
      status: 409,
      code: 'VERSION_CONFLICT',
      correlationId: 'corr-version-1',
      details: { expectedVersion: 3 },
    });
  });

  it('distinguishes a network failure from an authoritative HTTP rejection', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('connection refused'));
    const client = new ApiClient('/api/v1', fetchMock);

    await expect(client.health()).rejects.toBeInstanceOf(ApiNetworkError);
  });
});
