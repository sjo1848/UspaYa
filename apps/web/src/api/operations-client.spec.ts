import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from './client';
import { OperationsApi } from './operations-client';

describe('OperationsApi', () => {
  it('uses the discovery routes with operations identity', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const api = new OperationsApi(new ApiClient('/api/v1', fetchMock));

    await api.listAvailableCouriers('operations-1');
    await api.listPendingCompletion('operations-1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/operations/couriers/available');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/operations/orders/pending-completion');
    for (const call of fetchMock.mock.calls) {
      expect(new Headers(call[1]?.headers).get('x-dev-actor-id')).toBe('operations-1');
    }
  });

  it('uses expectedVersion for assignment and completion mutations', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ changed: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = new OperationsApi(new ApiClient('/api/v1', fetchMock));

    await api.assignCourier('operations-1', 'delivery/one', 'courier-1', 3);
    await api.completeOrder('operations-1', 'order/one', 7);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/v1/operations/deliveries/delivery%2Fone/assign',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ courierId: 'courier-1', expectedVersion: 3 }),
    );

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/v1/operations/orders/order%2Fone/complete',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ expectedVersion: 7 }));
  });

  it('reuses protected order detail and scoped audit routes for recovery', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = new OperationsApi(new ApiClient('/api/v1', fetchMock));

    await api.getOrder('operations-1', 'order/one');
    await api.auditOrder('operations-1', 'order/one');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/orders/order%2Fone');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/v1/operations/orders/order%2Fone/audit',
    );
  });
});
