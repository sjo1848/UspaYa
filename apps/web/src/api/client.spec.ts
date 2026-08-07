import { describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiNetworkError } from './client';

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

  it('uses the branch discovery and encoded catalog routes', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = new ApiClient('/api/v1', fetchMock);

    await client.listCatalogBranches('customer-1');
    await client.getBranchCatalog('customer-1', 'branch/with spaces');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/catalog/branches');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/v1/catalog/branches/branch%2Fwith%20spaces/products',
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('x-dev-actor-id')).toBe(
      'customer-1',
    );
  });

  it('uses the merchant inbox and transition routes with expectedVersion', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith('/merchant/orders')
        ? []
        : { orderId: 'order/with spaces', status: 'ACCEPTED', version: 2, changed: true };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new ApiClient('/api/v1', fetchMock);

    await client.listMerchantInbox('merchant-1');
    await client.acceptOrder('merchant-1', 'order/with spaces', 1);
    await client.startOrderPreparation('merchant-1', 'order/with spaces', 2);
    await client.markOrderReady('merchant-1', 'order/with spaces', 3);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/merchant/orders');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/orders/order%2Fwith%20spaces/accept');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/v1/orders/order%2Fwith%20spaces/start-preparation',
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/v1/orders/order%2Fwith%20spaces/ready');

    for (const [index, expectedVersion] of [1, 2, 3].entries()) {
      const [, init] = fetchMock.mock.calls[index + 1] ?? [];
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('x-dev-actor-id')).toBe('merchant-1');
      expect(init?.body).toBe(JSON.stringify({ expectedVersion }));
    }
  });

  it('keeps one idempotency key on the typed SubmitOrder request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          orderId: 'order-1',
          deliveryId: 'delivery-1',
          status: 'PENDING_MERCHANT',
          version: 2,
          totalCents: 100,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new ApiClient('/api/v1', fetchMock);
    const body = {
      orderId: 'order-1',
      deliveryId: 'delivery-1',
      paymentId: 'payment-1',
      branchId: 'branch-1',
      deliveryPin: '4826',
      items: [{ itemId: 'item-1', productId: 'product-1', quantity: 1 }],
    } as const;

    await client.submitOrder('customer-1', 'submit-order-12345678', body);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/orders');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('submit-order-12345678');
    expect(init?.body).toBe(JSON.stringify(body));
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

    await expect(client.request('/orders/1')).rejects.toMatchObject({
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
