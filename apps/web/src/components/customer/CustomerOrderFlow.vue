<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  ApiClient,
  ApiHttpError,
  ApiNetworkError,
  type BranchCatalogResponse,
  type CatalogBranchResponse,
  type CatalogProductResponse,
  type OrderProjectionResponse,
} from '@/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { createCustomerOrderIntent, type CustomerOrderIntent } from '@/customer/order-intent';

const props = defineProps<{
  actorId: string;
}>();

const api = new ApiClient();
const branches = ref<readonly CatalogBranchResponse[]>([]);
const branchesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const selectedBranchId = ref<string | null>(null);
const catalog = ref<BranchCatalogResponse | null>(null);
const catalogState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const quantities = ref<Record<string, number>>({});
const pin = ref('');
const addressText = ref('');
const phone = ref('');
const deliveryReference = ref('');
const lodging = ref('');
const intent = ref<CustomerOrderIntent | null>(null);
const order = ref<OrderProjectionResponse | null>(null);
const submitState = ref<
  'idle' | 'submitting' | 'uncertain' | 'retryable' | 'submitted' | 'rejected'
>('idle');
const message = ref<string | null>(null);
const correlationId = ref<string | null>(null);
let requestGeneration = 0;

const cartLocked = computed(() =>
  ['submitting', 'uncertain', 'retryable', 'submitted'].includes(submitState.value),
);
const cartLines = computed(() =>
  (catalog.value?.products ?? [])
    .map((product) => ({ product, quantity: quantities.value[product.id] ?? 0 }))
    .filter((line) => line.quantity > 0),
);
const totalPreviewCents = computed(() =>
  cartLines.value.reduce((total, line) => total + line.product.priceCents * line.quantity, 0),
);
const pinValid = computed(() => /^\d{4,6}$/.test(pin.value));
const destinationValid = computed(
  () => addressText.value.trim().length >= 3 && phone.value.trim().length >= 6,
);
const canSubmit = computed(
  () =>
    selectedBranchId.value !== null &&
    cartLines.value.length > 0 &&
    pinValid.value &&
    destinationValid.value &&
    !cartLocked.value,
);
const activePin = computed(() => intent.value?.request.deliveryPin ?? null);

watch(
  () => props.actorId,
  () => {
    requestGeneration += 1;
    resetCustomerFlow();
    void loadBranches();
  },
  { immediate: true },
);

async function loadBranches(): Promise<void> {
  const generation = requestGeneration;
  branchesState.value = 'loading';
  clearMessage();
  try {
    const result = await api.listCatalogBranches(props.actorId);
    if (generation !== requestGeneration) return;
    branches.value = result;
    branchesState.value = 'ready';
  } catch (error) {
    if (generation !== requestGeneration) return;
    branchesState.value = 'error';
    setError(error, 'No se pudieron cargar los comercios disponibles.');
  }
}

async function selectBranch(branchId: string): Promise<void> {
  if (cartLocked.value || selectedBranchId.value === branchId) return;

  const generation = ++requestGeneration;
  selectedBranchId.value = branchId;
  catalog.value = null;
  catalogState.value = 'loading';
  quantities.value = {};
  pin.value = '';
  intent.value = null;
  order.value = null;
  submitState.value = 'idle';
  clearMessage();

  try {
    const result = await api.getBranchCatalog(props.actorId, branchId);
    if (generation !== requestGeneration) return;
    catalog.value = result;
    catalogState.value = 'ready';
  } catch (error) {
    if (generation !== requestGeneration) return;
    catalogState.value = 'error';
    setError(error, 'No se pudo cargar el catálogo de la sucursal.');
  }
}

function setQuantity(productId: string, rawValue: string | number): void {
  if (cartLocked.value) return;
  const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  const quantity = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  const next = { ...quantities.value };
  if (quantity <= 0) {
    delete next[productId];
  } else {
    next[productId] = Math.min(quantity, 99);
  }
  quantities.value = next;
}

function changeQuantity(productId: string, delta: number): void {
  setQuantity(productId, (quantities.value[productId] ?? 0) + delta);
}

async function submitOrder(): Promise<void> {
  if (!canSubmit.value || selectedBranchId.value === null) return;

  clearMessage();
  intent.value = createCustomerOrderIntent(
    selectedBranchId.value,
    cartLines.value.map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
    })),
    pin.value,
    {
      addressText: addressText.value,
      phone: phone.value,
      reference: deliveryReference.value,
      lodging: lodging.value,
    },
  );
  await executeCurrentIntent();
}

async function executeCurrentIntent(): Promise<void> {
  const current = intent.value;
  if (current === null || submitState.value === 'submitting') return;

  submitState.value = 'submitting';
  clearMessage();
  try {
    await api.submitOrder(props.actorId, current.idempotencyKey, current.request);
    submitState.value = 'submitted';
    message.value = 'Pedido recibido por UspaYa. Consultando el estado vigente…';
    await refreshOrder(false);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      submitState.value = 'uncertain';
      message.value =
        'La red se interrumpió después del envío. No asumimos que el pedido haya fallado.';
      await recoverUncertainOrder();
      return;
    }

    submitState.value = 'rejected';
    setError(error, 'El pedido fue rechazado por la API.');
    if (
      error instanceof ApiHttpError &&
      error.status === 422 &&
      error.code === 'INVALID_ORDER_SUBMISSION'
    ) {
      intent.value = null;
      await refreshCatalogAfterRejection();
    }
  }
}

async function recoverUncertainOrder(): Promise<void> {
  const current = intent.value;
  if (current === null) return;

  try {
    order.value = await api.getOrder(props.actorId, current.request.orderId);
    submitState.value = 'submitted';
    message.value = 'El pedido sí existe. Se recuperó el resultado autoritativo.';
    correlationId.value = null;
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      submitState.value = 'uncertain';
      message.value =
        'Todavía no hay conexión suficiente para confirmar si el pedido fue recibido.';
      return;
    }
    if (error instanceof ApiHttpError && error.status === 404 && error.code === 'ORDER_NOT_FOUND') {
      submitState.value = 'retryable';
      message.value =
        'La API confirmó que ese pedido todavía no existe. Puede reintentarse la misma intención sin generar nuevos IDs.';
      correlationId.value = error.correlationId;
      return;
    }

    submitState.value = 'uncertain';
    setError(error, 'No se pudo determinar el resultado del pedido.');
  }
}

async function refreshOrder(showSuccessMessage = true): Promise<void> {
  const orderId = intent.value?.request.orderId ?? order.value?.id;
  if (orderId === undefined) return;

  try {
    order.value = await api.getOrder(props.actorId, orderId);
    submitState.value = 'submitted';
    if (showSuccessMessage) {
      message.value = 'Estado actualizado desde la API.';
      correlationId.value = null;
    }
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      message.value = 'No se pudo actualizar. Se conserva el último estado confirmado.';
      return;
    }
    setError(error, 'No se pudo actualizar el pedido.');
  }
}

async function refreshCatalogAfterRejection(): Promise<void> {
  const branchId = selectedBranchId.value;
  if (branchId === null) return;

  try {
    const nextCatalog = await api.getBranchCatalog(props.actorId, branchId);
    catalog.value = nextCatalog;
    catalogState.value = 'ready';
    const activeIds = new Set(nextCatalog.products.map((product) => product.id));
    quantities.value = Object.fromEntries(
      Object.entries(quantities.value).filter(([productId]) => activeIds.has(productId)),
    );
    message.value =
      'El catálogo fue actualizado. Los productos que ya no están disponibles se retiraron del carrito.';
  } catch (error) {
    setError(error, 'El pedido fue rechazado y además no se pudo refrescar el catálogo.');
  }
}

function startAnotherOrder(): void {
  intent.value = null;
  order.value = null;
  submitState.value = 'idle';
  quantities.value = {};
  pin.value = '';
  addressText.value = '';
  phone.value = '';
  deliveryReference.value = '';
  lodging.value = '';
  clearMessage();
}

function resetCustomerFlow(): void {
  branches.value = [];
  branchesState.value = 'idle';
  selectedBranchId.value = null;
  catalog.value = null;
  catalogState.value = 'idle';
  quantities.value = {};
  pin.value = '';
  addressText.value = '';
  phone.value = '';
  deliveryReference.value = '';
  lodging.value = '';
  intent.value = null;
  order.value = null;
  submitState.value = 'idle';
  clearMessage();
}

function clearMessage(): void {
  message.value = null;
  correlationId.value = null;
}

function setError(error: unknown, fallback: string): void {
  if (error instanceof ApiHttpError) {
    message.value = httpErrorMessage(error);
    correlationId.value = error.correlationId;
  } else if (error instanceof ApiNetworkError) {
    message.value = error.message;
    correlationId.value = null;
  } else {
    message.value = fallback;
    correlationId.value = null;
  }
}

const ORDER_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  SUBMITTED: 'Pedido enviado',
  PENDING_MERCHANT: 'El comercio está revisando tu pedido',
  CHANGE_PROPOSED: 'Necesitamos tu confirmación',
  ACCEPTED: 'Pedido aceptado',
  PREPARING: 'En preparación',
  READY: 'Listo',
  FULFILLED: 'Entregado',
  COMPLETED: 'Completado',
  CANCELLATION_REQUESTED: 'Cancelación en revisión',
  CANCELLED: 'Pedido cancelado',
  REJECTED: 'Pedido rechazado',
});

const PAYMENT_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  PENDING: 'Pago pendiente',
  REPORTED: 'Pago informado',
  PROCESSING: 'Pago en validación',
  CONFIRMED: 'Pago confirmado',
  FAILED: 'Pago no confirmado',
  CANCELLED: 'Pago cancelado',
  REFUND_PENDING: 'Reembolso pendiente',
  PARTIALLY_REFUNDED: 'Reembolso parcial',
  REFUNDED: 'Reembolsado',
  CHARGEBACK: 'Pago revertido',
});

const DELIVERY_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  REQUESTED: 'Entrega solicitada',
  PENDING_ASSIGNMENT: 'Buscando repartidor',
  OFFERED: 'Buscando repartidor',
  ASSIGNED: 'Repartidor asignado',
  READY_FOR_PICKUP: 'Listo para retirar',
  PICKUP_IN_PROGRESS: 'Retiro en curso',
  PICKED_UP: 'Pedido retirado',
  ON_THE_WAY: 'En camino',
  ARRIVED: 'El repartidor llegó',
  DELIVERED: 'Entregado',
  FAILED: 'Entrega con inconveniente',
  CANCELLED: 'Entrega cancelada',
});

const HTTP_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ROLE_FORBIDDEN: 'No tenés permiso para realizar esta acción.',
  ORDER_NOT_FOUND: 'El pedido no existe o ya no está disponible para este usuario.',
  INVALID_ORDER_SUBMISSION:
    'El pedido no pudo enviarse con los datos actuales. Revisá el carrito y el destino antes de volver a intentarlo.',
  IDEMPOTENCY_KEY_CONFLICT:
    'La intención de envío cambió. Actualizá el estado antes de volver a intentar.',
  VERSION_CONFLICT: 'El pedido cambió en otro dispositivo. Actualizá el estado antes de continuar.',
});

function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? 'Estado actualizado';
}

function paymentStatusLabel(status: string | undefined): string {
  if (status === undefined) return 'Sin pago';
  return PAYMENT_STATUS_LABELS[status] ?? 'Estado de pago actualizado';
}

function deliveryStatusLabel(status: string | undefined): string {
  if (status === undefined) return 'Sin entrega';
  return DELIVERY_STATUS_LABELS[status] ?? 'Estado de entrega actualizado';
}

function httpErrorMessage(error: ApiHttpError): string {
  return HTTP_ERROR_MESSAGES[error.code] ?? 'La API no pudo completar la operación.';
}

function money(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function branchLabel(branch: CatalogBranchResponse): string {
  return `${branch.merchantName} · ${branch.branchName}`;
}

function quantityFor(product: CatalogProductResponse): number {
  return quantities.value[product.id] ?? 0;
}
</script>

<template>
  <section class="space-y-6" aria-labelledby="customer-order-title">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Cliente
        </p>
        <h2 id="customer-order-title" class="text-2xl font-semibold tracking-tight">
          Hacer un pedido
        </h2>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Una sucursal por pedido. Los precios visibles son una previsualización; la API confirma
          los importes y congela los snapshots al enviar.
        </p>
      </div>
      <Button variant="outline" :disabled="branchesState === 'loading'" @click="loadBranches">
        Actualizar comercios
      </Button>
    </div>

    <Alert
      v-if="message"
      aria-live="polite"
      :variant="submitState === 'rejected' ? 'destructive' : 'default'"
    >
      <AlertTitle>
        {{ submitState === 'uncertain' ? 'Resultado incierto' : 'Estado del pedido' }}
      </AlertTitle>
      <AlertDescription class="space-y-1">
        <p>{{ message }}</p>
        <p v-if="correlationId" class="font-mono text-xs">
          Código de referencia: {{ correlationId }}
        </p>
      </AlertDescription>
    </Alert>

    <Card>
      <CardHeader>
        <CardTitle>1. Elegí un comercio</CardTitle>
        <CardDescription>
          Solo aparecen sucursales activas que hoy tienen al menos un producto activo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="branchesState === 'loading'" class="grid gap-3 sm:grid-cols-2">
          <Skeleton v-for="index in 2" :key="index" class="h-20 w-full" />
        </div>
        <div v-else-if="branches.length" class="grid gap-3 sm:grid-cols-2">
          <Button
            v-for="branch in branches"
            :key="branch.branchId"
            type="button"
            class="h-auto min-h-16 justify-start px-4 py-3 text-left whitespace-normal"
            :variant="selectedBranchId === branch.branchId ? 'default' : 'outline'"
            :disabled="cartLocked"
            @click="selectBranch(branch.branchId)"
          >
            {{ branchLabel(branch) }}
          </Button>
        </div>
        <p v-else-if="branchesState === 'ready'" class="text-sm text-muted-foreground">
          No hay sucursales con catálogo activo en este momento.
        </p>
        <p v-else-if="branchesState === 'error'" class="text-sm text-destructive">
          No fue posible consultar los comercios.
        </p>
      </CardContent>
    </Card>

    <Card v-if="selectedBranchId">
      <CardHeader>
        <CardTitle>2. Armá el carrito</CardTitle>
        <CardDescription>
          Cantidad permitida por producto: 1 a 99. Cambiar de sucursal vacía el carrito.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="catalogState === 'loading'" class="grid gap-3 sm:grid-cols-2">
          <Skeleton v-for="index in 4" :key="index" class="h-32 w-full" />
        </div>
        <div v-else-if="catalog?.products.length" class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="product in catalog.products"
            :key="product.id"
            class="rounded-xl border bg-card p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-semibold">{{ product.name }}</h3>
                <p class="text-xs text-muted-foreground">{{ product.sku }}</p>
              </div>
              <Badge variant="secondary">{{ money(product.priceCents) }}</Badge>
            </div>
            <div class="mt-4 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                :disabled="cartLocked || quantityFor(product) === 0"
                :aria-label="`Quitar una unidad de ${product.name}`"
                @click="changeQuantity(product.id, -1)"
              >
                −
              </Button>
              <Input
                class="w-20 text-center"
                type="number"
                inputmode="numeric"
                min="0"
                max="99"
                :disabled="cartLocked"
                :model-value="quantityFor(product)"
                :aria-label="`Cantidad de ${product.name}`"
                @update:model-value="setQuantity(product.id, $event)"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                :disabled="cartLocked || quantityFor(product) >= 99"
                :aria-label="`Agregar una unidad de ${product.name}`"
                @click="changeQuantity(product.id, 1)"
              >
                +
              </Button>
            </div>
          </div>
        </div>
        <p v-else-if="catalogState === 'ready'" class="text-sm text-muted-foreground">
          Esta sucursal ya no tiene productos disponibles. Actualizá los comercios.
        </p>
      </CardContent>
    </Card>

    <Card v-if="catalog && cartLines.length > 0">
      <CardHeader>
        <CardTitle>3. Confirmá destino y entrega</CardTitle>
        <CardDescription>
          La dirección y el teléfono se congelan con este pedido. No se guardan en el navegador ni
          se reutilizan como perfil.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-5">
        <div class="space-y-3">
          <div v-for="line in cartLines" :key="line.product.id" class="flex justify-between gap-3">
            <span>{{ line.quantity }} × {{ line.product.name }}</span>
            <strong>{{ money(line.product.priceCents * line.quantity) }}</strong>
          </div>
          <Separator />
          <div class="flex justify-between gap-3 text-lg">
            <span>Total estimado</span>
            <strong>{{ money(totalPreviewCents) }}</strong>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2 sm:col-span-2">
            <Label for="delivery-address">Dirección de entrega</Label>
            <Input
              id="delivery-address"
              v-model="addressText"
              autocomplete="street-address"
              maxlength="240"
              placeholder="Calle, número o descripción clara"
              :disabled="cartLocked"
            />
          </div>
          <div class="space-y-2">
            <Label for="delivery-phone">Teléfono de contacto</Label>
            <Input
              id="delivery-phone"
              v-model="phone"
              type="tel"
              autocomplete="tel"
              maxlength="32"
              placeholder="Teléfono para la entrega"
              :disabled="cartLocked"
            />
          </div>
          <div class="space-y-2">
            <Label for="delivery-reference">Referencia (opcional)</Label>
            <Input
              id="delivery-reference"
              v-model="deliveryReference"
              autocomplete="off"
              maxlength="240"
              placeholder="Portón, color, acceso, km…"
              :disabled="cartLocked"
            />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label for="delivery-lodging">Alojamiento (opcional)</Label>
            <Input
              id="delivery-lodging"
              v-model="lodging"
              autocomplete="organization"
              maxlength="160"
              placeholder="Hotel, hostel, cabaña o complejo"
              :disabled="cartLocked"
            />
          </div>
        </div>

        <div class="max-w-xs space-y-2">
          <Label for="delivery-pin">PIN de entrega</Label>
          <Input
            id="delivery-pin"
            v-model="pin"
            type="password"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            pattern="[0-9]{4,6}"
            placeholder="4 a 6 dígitos"
            :disabled="cartLocked"
          />
          <p class="text-xs text-muted-foreground">
            El servidor conserva solo un verificador seguro. Guardá el PIN mientras dure el pedido.
          </p>
        </div>
      </CardContent>
      <CardFooter class="flex flex-wrap gap-2">
        <Button :disabled="!canSubmit" @click="submitOrder">
          {{ submitState === 'submitting' ? 'Enviando…' : 'Enviar pedido' }}
        </Button>
        <Button v-if="submitState === 'retryable'" variant="outline" @click="executeCurrentIntent">
          Reintentar la misma intención
        </Button>
        <Button v-if="submitState === 'uncertain'" variant="outline" @click="recoverUncertainOrder">
          Comprobar si llegó
        </Button>
      </CardFooter>
    </Card>

    <Card v-if="order">
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Seguimiento del pedido</CardTitle>
            <CardDescription class="font-mono text-xs">{{ order.id }}</CardDescription>
          </div>
          <Button variant="outline" @click="refreshOrder()">Actualizar estado</Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-5">
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border p-3">
            <p class="text-xs font-medium text-muted-foreground">Pedido</p>
            <Badge class="mt-2" variant="outline">{{ orderStatusLabel(order.status) }}</Badge>
          </div>
          <div class="rounded-xl border p-3">
            <p class="text-xs font-medium text-muted-foreground">Pago</p>
            <Badge class="mt-2" variant="outline">{{
              paymentStatusLabel(order.payment?.status)
            }}</Badge>
          </div>
          <div class="rounded-xl border p-3">
            <p class="text-xs font-medium text-muted-foreground">Entrega</p>
            <Badge class="mt-2" variant="outline">
              {{ deliveryStatusLabel(order.delivery?.status) }}
            </Badge>
          </div>
        </div>

        <div class="grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Sucursal:</strong> {{ order.branch.name }}</p>
          <p><strong>Total confirmado:</strong> {{ money(order.totalCents) }}</p>
          <p><strong>Versión Pedido:</strong> {{ order.version }}</p>
          <p v-if="order.delivery?.courierId"><strong>Repartidor:</strong> asignado</p>
        </div>

        <Alert v-if="activePin">
          <AlertTitle>PIN disponible solo en esta sesión</AlertTitle>
          <AlertDescription>
            <span class="font-mono text-lg font-semibold tracking-[0.2em]">{{ activePin }}</span>
            <p class="mt-1 text-xs">
              Si recargás o cerrás esta sesión, UspaYa no puede recuperarlo todavía.
            </p>
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter>
        <Button variant="outline" @click="startAnotherOrder">Preparar otro pedido</Button>
      </CardFooter>
    </Card>
  </section>
</template>
