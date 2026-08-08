import { expect, test, type Page } from '@playwright/test';

const PIN = '4826';
const EXPECTED_CASH_PESOS = '4500';

async function selectActor(page: Page, label: string, surfaceHeading: string): Promise<void> {
  await page.getByLabel('Simular actor sembrado').selectOption({ label });
  await expect(page.getByRole('heading', { name: surfaceHeading, exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hacer un pedido', exact: true })).toBeVisible();
});

test('mounts only the functional surface for the effective actor role', async ({ page }) => {
  await selectActor(page, 'Comercio', 'Bandeja de pedidos');
  await expect(page.getByRole('heading', { name: 'Hacer un pedido', exact: true })).toHaveCount(0);

  await selectActor(page, 'Operaciones', 'Colas operativas');
  await expect(page.getByText('No hay entregas pendientes de asignación.')).toBeVisible();

  await selectActor(page, 'Repartidor', 'Entrega activa');
  await expect(page.getByText('No tenés una entrega activa')).toBeVisible();

  await selectActor(page, 'Cliente', 'Hacer un pedido');
});

test('completes the vertical through UI and recovers lost authoritative responses', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Comercio Piloto · Sucursal Centro', exact: true })
    .click();
  await expect(page.getByText('Producto Piloto A', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar una unidad de Producto Piloto A' }).click();
  await page.getByLabel('PIN de entrega').fill(PIN);
  await page.getByRole('button', { name: 'Enviar pedido', exact: true }).click();

  await expect(page.getByText('Seguimiento del pedido', { exact: true })).toBeVisible();
  await expect(page.getByText(PIN, { exact: true })).toBeVisible();
  await expect(page.getByText('Pendiente de revisión', { exact: true })).toBeVisible();

  let acceptLossInjected = false;
  await page.route('**/api/v1/orders/*/accept', async (route) => {
    if (!acceptLossInjected) {
      acceptLossInjected = true;
      const upstream = await route.fetch();
      expect(upstream.ok()).toBeTruthy();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await selectActor(page, 'Comercio', 'Bandeja de pedidos');
  const pendingOrder = page.getByRole('button').filter({ hasText: 'Pendiente de revisión' }).first();
  await expect(pendingOrder).toBeVisible();
  await pendingOrder.click();
  await page.getByRole('button', { name: 'Aceptar pedido', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Iniciar preparación', exact: true })).toBeVisible();
  expect(acceptLossInjected).toBe(true);
  await page.getByRole('button', { name: 'Iniciar preparación', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Marcar como listo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Marcar como listo', exact: true }).click();
  await expect(
    page.getByText('El pedido está listo. Esto habilita el retiro, pero no significa que ya fue entregado.'),
  ).toBeVisible();

  await selectActor(page, 'Operaciones', 'Colas operativas');
  const unassignedDelivery = page.getByRole('button').filter({ hasText: 'Sin repartidor' }).first();
  await expect(unassignedDelivery).toBeVisible();
  await unassignedDelivery.click();
  await page.locator('#operations-courier').click();
  await page.getByRole('option', { name: 'Repartidor Piloto', exact: true }).click();
  await page.getByRole('button', { name: 'Asignar repartidor', exact: true }).click();
  await expect(
    page.getByText('Repartidor asignado. Actualizamos la cola autoritativa.', { exact: true }),
  ).toBeVisible();

  await selectActor(page, 'Repartidor', 'Entrega activa');
  await expect(page.getByText('Entrega asignada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar retiro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar custodia', exact: true })).toBeVisible();
  await page.getByLabel('Responsable del comercio').fill('Responsable E2E');
  await page.getByLabel('Cantidad de bultos').fill('2');
  await page.getByRole('button', { name: 'Confirmar custodia', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Iniciar traslado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar traslado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Llegué al destino', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Llegué al destino', exact: true }).click();

  await expect(
    page.getByRole('button', { name: 'Confirmar entrega y cobro', exact: true }),
  ).toBeVisible();
  await page.getByLabel('PIN de entrega').fill(PIN);
  await page.getByLabel('Receptor').fill('Cliente E2E');
  await page.getByLabel('Efectivo recibido (ARS)').fill(EXPECTED_CASH_PESOS);
  await expect(page.getByText('Diferencia:')).toBeVisible();

  let finalAttempts = 0;
  let originalIdempotencyKey: string | undefined;
  let originalPayload: string | null = null;
  await page.route('**/api/v1/courier/deliveries/*/confirm-delivery', async (route) => {
    finalAttempts += 1;
    const request = route.request();
    const key = request.headers()['idempotency-key'];
    const payload = request.postData();

    if (finalAttempts === 1) {
      originalIdempotencyKey = key;
      originalPayload = payload;
      expect(originalIdempotencyKey).toBeTruthy();
      const upstream = await route.fetch();
      expect(upstream.ok()).toBeTruthy();
      await route.abort('failed');
      return;
    }

    expect(key).toBe(originalIdempotencyKey);
    expect(payload).toBe(originalPayload);
    await route.continue();
  });

  await page.getByRole('button', { name: 'Confirmar entrega y cobro', exact: true }).click();
  await expect(page.getByText('Resultado pendiente de verificar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Verificar entrega', exact: true }).click();

  await expect(page.getByText('No tenés una entrega activa', { exact: true })).toBeVisible();
  await expect(page.getByText('Entrega confirmada', { exact: true })).toBeVisible();
  expect(finalAttempts).toBe(2);

  const browserStorage = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  expect(JSON.stringify(browserStorage)).not.toContain(PIN);

  await selectActor(page, 'Operaciones', 'Colas operativas');
  const pendingClose = page.getByRole('button').filter({ hasText: 'Listo para cerrar' }).first();
  await expect(pendingClose).toBeVisible();
  await expect(pendingClose).toContainText('Pago confirmado');
  await expect(pendingClose).toContainText('Entrega realizada');
  await pendingClose.click();
  await page.getByRole('button', { name: 'Completar pedido', exact: true }).click();

  await expect(page.getByText('Pedido cerrado correctamente.', { exact: true })).toBeVisible();
  await expect(page.getByText('No hay pedidos pendientes de cierre.', { exact: true })).toBeVisible();
  await expect(page.getByText('Pedido completado', { exact: true })).toBeVisible();

  const body = page.locator('body');
  await expect(body).not.toContainText('PENDING_MERCHANT');
  await expect(body).not.toContainText('PICKUP_IN_PROGRESS');
  await expect(body).not.toContainText('FULFILLED');
  await expect(body).not.toContainText('COMPLETED');
});
