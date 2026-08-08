import { describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiNetworkError } from './client';

describe('ApiClient', () => {
  it('invokes the default global fetch with the global receiver', async () => {
    let observedInput: RequestInfo | URL | undefined;
    const receiverFetch: typeof fetch = async function (
      this: typeof globalThis,
      input: RequestInfo | URL,
    ) {
      expect(this).toBe(globalThis);
      observedInput = input;
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    vi.stubGlobal('fetch', receiverFetch);

    try {
      const client = new ApiClient('https://example.test/api/v1');
      await expect(client.health()).resolves.toEqual({ status: 'ok' });
      expect(observedInput).toBe('https://example.test/api/v1/health');
    } finally {
      vi.unstubAllGlobals();
    }
  });

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

  it('uses the operations discovery, mutation and audit routes', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith('/operations/deliveries/unassigned') ? { deliveries: [] } : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new ApiClient('/api/v1', fetchMock);

    await client.listUnassignedDeliveries('operations-1');
    await client.listAvailableCouriers('operations-1');
    await client.listPendingCompletionOrders('operations-1');
    await client.assignCourier('operations-1', 'delivery/one', 'courier-1', 3);
    await client.completeOrder('operations-1', 'order/one', 7);
    await client.getOrderAudit('operations-1', 'order/one');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/operations/deliveries/unassigned');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/operations/couriers/available');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/operations/orders/pending-completion');
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      '/api/v1/operations/deliveries/delivery%2Fone/assign',
    );
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe(
      JSON.stringify({ courierId: 'courier-1', expectedVersion: 3 }),
    );
    expect(fetchMock.mock.calls[4]?.[0]).toBe('/api/v1/operations/orders/order%2Fone/complete');
    expect(fetchMock.mock.calls[4]?.[1]?.body).toBe(JSON.stringify({ expectedVersion: 7 }));
    expect(fetchMock.mock.calls[5]?.[0]).toBe('/api/v1/operations/orders/order%2Fone/audit');

    for (const call of fetchMock.mock.calls) {
      expect(new Headers(call[1]?.headers).get('x-dev-actor-id')).toBe('operations-1');
    }
  });

  it('uses the courier active-delivery lifecycle and preserves final-delivery idempotency', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith('/active')
        ? {
            delivery: {
              id: 'delivery-1',
              orderId: 'order-1',
              status: 'ASSIGNED',
              version: 2,
              expectedCashCents: 250000,
              orderStatus: 'READY',
              orderTotalCents: 250000,
              branch: { id: 'branch-1', name: 'Sucursal piloto' },
              destination: null,
            },
          }
        : { deliveryId: 'delivery-1', orderId: 'order-1', status: 'PICKED_UP', version: 4 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new ApiClient('/api/v1', fetchMock);
    const finalBody = {
      expectedVersion: 6,
      pin: '4826',
      receiver: 'Cliente receptor',
      cashReceivedCents: 250000,
    } as const;

    await client.getActiveCourierDelivery('courier-1');
    await client.startCourierPickup('courier-1', 'delivery/one', 2);
    await client.confirmCourierPickup('courier-1', 'delivery/one', 3, 'Responsable', 2);
    await client.startCourierDelivery('courier-1', 'delivery/one', 4);
    await client.reportCourierArrival('courier-1', 'delivery/one', 5);
    await client.confirmCourierDelivery(
      'courier-1',
      'delivery/one',
      'confirm-delivery-12345678',
      finalBody,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/courier/deliveries/active');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/v1/courier/deliveries/delivery%2Fone/start-pickup',
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/v1/courier/deliveries/delivery%2Fone/confirm-pickup',
    );
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ expectedVersion: 3, merchantResponsible: 'Responsable', packageCount: 2 }),
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      '/api/v1/courier/deliveries/delivery%2Fone/start-delivery',
    );
    expect(fetchMock.mock.calls[4]?.[0]).toBe('/api/v1/courier/deliveries/delivery%2Fone/arrive');
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      '/api/v1/courier/deliveries/delivery%2Fone/confirm-delivery',
    );
    expect(new Headers(fetchMock.mock.calls[5]?.[1]?.headers).get('Idempotency-Key')).toBe(
      'confirm-delivery-12345678',
    );
    expect(fetchMock.mock.calls[5]?.[1]?.body).toBe(JSON.stringify(finalBody));

    for (const call of fetchMock.mock.calls) {
      expect(new Headers(call[1]?.headers).get('x-dev-actor-id')).toBe('courier-1');
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
      deliveryDestination: {
        addressText: 'Av. Las Heras 120, Uspallata',
        phone: '+54 9 261 555 0101',
      },
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
