import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const evidenceEnabled = process.env.PORTFOLIO_EVIDENCE === '1';
const PIN = '4826';
const DELIVERY_ADDRESS = 'Av. Las Heras 120, Uspallata';
const DELIVERY_PHONE = '+54 9 261 555 0101';
const OUTPUT_DIR = 'docs/media/portfolio';

async function selectActor(page: Page, label: string, surfaceHeading: string): Promise<void> {
  await page.getByLabel('Simular actor sembrado').selectOption({ label });
  await expect(page.getByRole('heading', { name: surfaceHeading, exact: true })).toBeVisible();
}

test.skip(!evidenceEnabled, 'Portfolio evidence capture only runs in its dedicated workflow.');

test.beforeAll(() => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
});

test('captures the four actor surfaces from the real seeded runtime', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hacer un pedido', exact: true })).toBeVisible();

  await page
    .getByRole('button', { name: 'Comercio Piloto · Sucursal Centro', exact: true })
    .click();
  await expect(page.getByText('Producto Piloto A', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${OUTPUT_DIR}/uspaya-customer-mobile.png`, fullPage: true });

  await page.getByRole('button', { name: 'Agregar una unidad de Producto Piloto A' }).click();
  await page.getByLabel('Dirección de entrega').fill(DELIVERY_ADDRESS);
  await page.getByLabel('Teléfono de contacto').fill(DELIVERY_PHONE);
  await page.getByLabel('Referencia (opcional)').fill('Portón azul');
  await page.getByLabel('PIN de entrega').fill(PIN);
  await page.getByRole('button', { name: 'Enviar pedido', exact: true }).click();
  await expect(page.getByText('Seguimiento del pedido', { exact: true })).toBeVisible();

  await selectActor(page, 'Comercio', 'Bandeja de pedidos');
  const pendingOrder = page
    .getByRole('button')
    .filter({ hasText: 'Pendiente de revisión' })
    .first();
  await expect(pendingOrder).toBeVisible();
  await page.screenshot({ path: `${OUTPUT_DIR}/uspaya-merchant-mobile.png`, fullPage: true });

  await pendingOrder.click();
  await page.getByRole('button', { name: 'Aceptar pedido', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar preparación', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar preparación', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Marcar como listo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Marcar como listo', exact: true }).click();

  await selectActor(page, 'Operaciones', 'Colas operativas');
  const unassignedDelivery = page.getByRole('button').filter({ hasText: 'Sin repartidor' }).first();
  await expect(unassignedDelivery).toBeVisible();
  await page.screenshot({ path: `${OUTPUT_DIR}/uspaya-operations-mobile.png`, fullPage: true });

  await unassignedDelivery.click();
  await page.locator('#operations-courier').click();
  await page.getByRole('option', { name: 'Repartidor Piloto', exact: true }).click();
  await page.getByRole('button', { name: 'Asignar repartidor', exact: true }).click();
  await expect(
    page.getByText('Repartidor asignado. Actualizamos la cola autoritativa.', { exact: true }),
  ).toBeVisible();

  await selectActor(page, 'Repartidor', 'Entrega activa');
  const startPickup = page.getByRole('button', { name: 'Iniciar retiro', exact: true });
  await expect(startPickup).toBeVisible();
  await startPickup.click();
  await expect(page.getByRole('button', { name: 'Confirmar custodia', exact: true })).toBeVisible();
  await page.getByLabel('Responsable del comercio').fill('Responsable Demo');
  await page.getByLabel('Cantidad de bultos').fill('2');
  await page.getByRole('button', { name: 'Confirmar custodia', exact: true }).click();

  const destinationCard = page.locator('[aria-label="Destino de entrega"]');
  await expect(destinationCard).toBeVisible();
  await expect(destinationCard).toContainText(DELIVERY_ADDRESS);
  await page.screenshot({ path: `${OUTPUT_DIR}/uspaya-courier-mobile.png`, fullPage: true });
});
