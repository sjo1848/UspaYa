<script setup lang="ts">
import { ref, watch } from 'vue';

import {
  ApiClient,
  ApiHttpError,
  ApiNetworkError,
  type OrderProjectionResponse,
} from '@/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  listCustomerActiveOrders,
  type CustomerActiveOrderResponse,
} from '@/customer/active-orders';

const props = defineProps<{ actorId: string }>();

const api = new ApiClient();
const activeOrders = ref<readonly CustomerActiveOrderResponse[]>([]);
const selectedOrder = ref<OrderProjectionResponse | null>(null);
const listState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const detailState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const message = ref<string | null>(null);
const correlationId = ref<string | null>(null);
let generation = 0;

watch(
  () => props.actorId,
  () => {
    generation += 1;
    reset();
    void loadActiveOrders();
  },
  { immediate: true },
);

async function loadActiveOrders(): Promise<void> {
  const currentGeneration = generation;
  listState.value = 'loading';
  message.value = null;
  correlationId.value = null;

  try {
    const orders = await listCustomerActiveOrders(api, props.actorId);
    if (currentGeneration !== generation) return;

    activeOrders.value = orders;
    listState.value = 'ready';

    if (orders.length === 1 && orders[0] !== undefined) {
      await openOrder(orders[0], false, currentGeneration);
      return;
    }

    if (
      selectedOrder.value !== null &&
      !orders.some((candidate) => candidate.orderId === selectedOrder.value?.id)
    ) {
      selectedOrder.value = null;
      detailState.value = 'idle';
    }
  } catch (error) {
    if (currentGeneration !== generation) return;
    listState.value = 'error';
    setError(error, 'No se pudieron recuperar tus pedidos en curso.');
  }
}

async function openOrder(
  summary: CustomerActiveOrderResponse,
  showSelectionMessage = true,
  expectedGeneration = generation,
): Promise<void> {
  detailState.value = 'loading';
  message.value = null;
  correlationId.value = null;

  try {
    const order = await api.getOrder(props.actorId, summary.orderId);
    if (expectedGeneration !== generation) return;
    selectedOrder.value = order;
    detailState.value = 'ready';
    if (showSelectionMessage) {
      message.value = 'Pedido recuperado desde el servidor.';
    }
  } catch (error) {
    if (expectedGeneration !== generation) return;
    detailState.value = 'error';
    setError(error, 'El pedido figura activo, pero no se pudo abrir su estado vigente.');
  }
}

async function refreshSelectedOrder(): Promise<void> {
  const current = selectedOrder.value;
  if (current === null) return;

  detailState.value = 'loading';
  message.value = null;
  correlationId.value = null;
  try {
    selectedOrder.value = await api.getOrder(props.actorId, current.id);
    detailState.value = 'ready';
    message.value = 'Estado actualizado desde el servidor.';
  } catch (error) {
    detailState.value = 'error';
    setError(error, 'No se pudo actualizar el pedido recuperado.');
  }
}

function reset(): void {
  activeOrders.value = [];
  selectedOrder.value = null;
  listState.value = 'idle';
  detailState.value = 'idle';
  message.value = null;
  correlationId.value = null;
}

function setError(error: unknown, fallback: string): void {
  if (error instanceof ApiHttpError) {
    message.value = error.code === 'ROLE_FORBIDDEN' ? 'No tenés permiso para esta consulta.' : fallback;
    correlationId.value = error.correlationId;
  } else if (error instanceof ApiNetworkError) {
    message.value = 'No hay conexión suficiente para recuperar tus pedidos en curso.';
    correlationId.value = null;
  } else {
    message.value = fallback;
    correlationId.value = null;
  }
}

function orderStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = Object.freeze({
    SUBMITTED: 'Pedido enviado',
    PENDING_MERCHANT: 'El comercio está revisando tu pedido',
    CHANGE_PROPOSED: 'Necesitamos tu confirmación',
    ACCEPTED: 'Pedido aceptado',
    PREPARING: 'En preparación',
    READY: 'Listo',
    FULFILLED: 'Entregado',
    CANCELLATION_REQUESTED: 'Cancelación en revisión',
  });
  return labels[status] ?? 'Pedido en curso';
}

function paymentStatusLabel(status: string | null | undefined): string {
  const labels: Readonly<Record<string, string>> = Object.freeze({
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
  if (status === null || status === undefined) return 'Sin pago';
  return labels[status] ?? 'Estado de pago actualizado';
}

function deliveryStatusLabel(status: string | null | undefined): string {
  const labels: Readonly<Record<string, string>> = Object.freeze({
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
  if (status === null || status === undefined) return 'Sin entrega';
  return labels[status] ?? 'Estado de entrega actualizado';
}

function money(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortId(value: string): string {
  return value.slice(-8).toUpperCase();
}
</script>

<template>
  <section class="space-y-4" aria-labelledby="customer-active-orders-title">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Recuperación
        </p>
        <h2 id="customer-active-orders-title" class="text-2xl font-semibold tracking-tight">
          Pedidos en curso
        </h2>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          UspaYa consulta el servidor para que puedas volver al seguimiento después de recargar o
          cerrar la aplicación. No recupera ni guarda el PIN.
        </p>
      </div>
      <Button variant="outline" :disabled="listState === 'loading'" @click="loadActiveOrders">
        Actualizar pedidos
      </Button>
    </div>

    <Alert v-if="message" :variant="listState === 'error' || detailState === 'error' ? 'destructive' : 'default'">
      <AlertTitle>Estado de recuperación</AlertTitle>
      <AlertDescription class="space-y-1">
        <p>{{ message }}</p>
        <p v-if="correlationId" class="font-mono text-xs">
          Código de referencia: {{ correlationId }}
        </p>
      </AlertDescription>
    </Alert>

    <div v-if="listState === 'loading'" class="grid gap-3 sm:grid-cols-2">
      <Skeleton v-for="index in 2" :key="index" class="h-24 w-full" />
    </div>

    <Card v-else-if="listState === 'ready' && activeOrders.length === 0">
      <CardHeader>
        <CardTitle>No hay pedidos en curso</CardTitle>
        <CardDescription>
          Esta consulta no crea pedidos ni modifica estados. Podés iniciar uno nuevo abajo.
        </CardDescription>
      </CardHeader>
    </Card>

    <div v-else-if="activeOrders.length" class="grid gap-3 sm:grid-cols-2" aria-label="Pedidos activos del cliente">
      <Button
        v-for="candidate in activeOrders"
        :key="candidate.orderId"
        type="button"
        variant="outline"
        class="h-auto min-h-24 justify-start px-4 py-3 text-left whitespace-normal"
        :aria-pressed="selectedOrder?.id === candidate.orderId"
        @click="openOrder(candidate)"
      >
        <span class="space-y-1">
          <span class="block font-semibold">{{ candidate.branch.name }}</span>
          <span class="block text-sm">{{ orderStatusLabel(candidate.status) }}</span>
          <span class="block text-xs opacity-80">
            Pedido {{ shortId(candidate.orderId) }} · {{ money(candidate.totalCents) }}
          </span>
        </span>
      </Button>
    </div>

    <Skeleton v-if="detailState === 'loading'" class="h-56 w-full" />

    <Card v-else-if="selectedOrder" aria-label="Seguimiento recuperado del pedido">
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Seguimiento recuperado</CardTitle>
            <CardDescription class="font-mono text-xs">{{ selectedOrder.id }}</CardDescription>
          </div>
          <Button variant="outline" @click="refreshSelectedOrder">Actualizar estado</Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-5">
        <Alert>
          <AlertTitle>El pedido volvió a cargarse desde el servidor</AlertTitle>
          <AlertDescription>
            El PIN no se recuperó ni se guardó. Si ya no lo recordás, no intentes reemplazarlo ni
            compartir otro código; el caso debe resolverse por el procedimiento de soporte del
            piloto.
          </AlertDescription>
        </Alert>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border p-3">
            <p class="text-xs font-medium text-muted-foreground">Pedido</p>
            <Badge class="mt-2" variant="outline">{{ orderStatusLabel(selectedOrder.status) }}</Badge>
          </div>
          <div class="rounded-xl border p-3">
            <p class="text-xs font-medium text-muted-foreground">Pago</p>
            <Badge class="mt-2" variant="outline">
              {{ paymentStatusLabel(selectedOrder.payment?.status) }}
            </Badge>
          </div>
          <div class="rounded-xl border p-3">
            <p class="text-xs font-medium text-muted-foreground">Entrega</p>
            <Badge class="mt-2" variant="outline">
              {{ deliveryStatusLabel(selectedOrder.delivery?.status) }}
            </Badge>
          </div>
        </div>

        <div class="grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Sucursal:</strong> {{ selectedOrder.branch.name }}</p>
          <p><strong>Total confirmado:</strong> {{ money(selectedOrder.totalCents) }}</p>
          <p><strong>Versión Pedido:</strong> {{ selectedOrder.version }}</p>
          <p v-if="selectedOrder.delivery?.courierId"><strong>Repartidor:</strong> asignado</p>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
