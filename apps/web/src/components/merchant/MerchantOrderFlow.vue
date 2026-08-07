<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  ApiClient,
  ApiHttpError,
  ApiNetworkError,
  type MerchantActionableOrderResponse,
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const props = defineProps<{
  actorId: string;
}>();

const api = new ApiClient();
const actionableOrders = ref<readonly MerchantActionableOrderResponse[]>([]);
const selectedOrder = ref<OrderProjectionResponse | null>(null);
const queueState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const detailState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const mutationState = ref<'idle' | 'submitting' | 'uncertain'>('idle');
const message = ref<string | null>(null);
const correlationId = ref<string | null>(null);
let requestGeneration = 0;

const mutationPending = computed(() => mutationState.value !== 'idle');
const selectedAction = computed(() => {
  const status = selectedOrder.value?.status;
  if (status === 'PENDING_MERCHANT') {
    return { key: 'accept' as const, label: 'Aceptar pedido' };
  }
  if (status === 'ACCEPTED') {
    return { key: 'prepare' as const, label: 'Iniciar preparación' };
  }
  if (status === 'PREPARING') {
    return { key: 'ready' as const, label: 'Marcar como listo' };
  }
  return null;
});

watch(
  () => props.actorId,
  () => {
    requestGeneration += 1;
    actionableOrders.value = [];
    selectedOrder.value = null;
    queueState.value = 'idle';
    detailState.value = 'idle';
    mutationState.value = 'idle';
    clearMessage();
    void loadActionableOrders();
  },
  { immediate: true },
);

async function loadActionableOrders(preserveMessage = false): Promise<void> {
  const generation = requestGeneration;
  queueState.value = 'loading';
  if (!preserveMessage) clearMessage();

  try {
    const result = await api.listMerchantActionableOrders(props.actorId);
    if (generation !== requestGeneration) return;
    actionableOrders.value = result;
    queueState.value = 'ready';
  } catch (error) {
    if (generation !== requestGeneration) return;
    queueState.value = 'error';
    setError(error, 'No se pudieron cargar los pedidos pendientes del comercio.');
  }
}

async function selectOrder(orderId: string): Promise<void> {
  if (mutationPending.value) return;
  await refreshOrder(orderId);
}

async function refreshSelectedOrder(preserveMessage = false): Promise<void> {
  const orderId = selectedOrder.value?.id;
  if (orderId === undefined) return;
  await refreshOrder(orderId, preserveMessage);
}

async function refreshOrder(orderId: string, preserveMessage = false): Promise<void> {
  const generation = requestGeneration;
  detailState.value = 'loading';
  if (!preserveMessage) clearMessage();

  try {
    const result = await api.getOrder(props.actorId, orderId);
    if (generation !== requestGeneration) return;
    selectedOrder.value = result;
    detailState.value = 'ready';
  } catch (error) {
    if (generation !== requestGeneration) return;
    detailState.value = 'error';
    setError(error, 'No se pudo consultar el estado actual del pedido.');
  }
}

async function executeSelectedAction(): Promise<void> {
  const order = selectedOrder.value;
  const action = selectedAction.value;
  if (order === null || action === null || mutationPending.value) return;

  const previousStatus = order.status;
  const previousVersion = order.version;
  mutationState.value = 'submitting';
  clearMessage();

  try {
    if (action.key === 'accept') {
      await api.acceptOrder(props.actorId, order.id, previousVersion);
    } else if (action.key === 'prepare') {
      await api.startOrderPreparation(props.actorId, order.id, previousVersion);
    } else {
      await api.markOrderReady(props.actorId, order.id, previousVersion);
    }

    mutationState.value = 'idle';
    message.value = 'Cambio confirmado. Actualizamos el pedido con el estado autoritativo.';
    await refreshSelectedOrder(true);
    await loadActionableOrders(true);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      message.value =
        'La conexión se interrumpió durante la acción. No asumimos que el cambio haya fallado.';
      await recoverUncertainMutation(order.id, previousStatus, previousVersion);
      return;
    }

    mutationState.value = 'idle';
    if (error instanceof ApiHttpError && error.code === 'VERSION_CONFLICT') {
      correlationId.value = error.correlationId;
      message.value = 'El pedido cambió en otro dispositivo. Cargamos el estado vigente.';
      await refreshSelectedOrder(true);
      await loadActionableOrders(true);
      return;
    }

    setError(error, 'No se pudo completar la acción del comercio.');
  }
}

async function recoverUncertainMutation(
  orderId: string,
  previousStatus: string,
  previousVersion: number,
): Promise<void> {
  try {
    const recovered = await api.getOrder(props.actorId, orderId);
    selectedOrder.value = recovered;
    detailState.value = 'ready';
    mutationState.value = 'idle';

    if (recovered.status !== previousStatus || recovered.version !== previousVersion) {
      message.value = 'El servidor confirma que el pedido cambió. Mostramos el estado vigente.';
    } else {
      message.value =
        'El servidor todavía muestra el estado anterior. Revisá el pedido antes de intentar otra acción.';
    }
    await loadActionableOrders(true);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      message.value =
        'Todavía no podemos verificar el resultado. No repitas la acción hasta recuperar conexión y actualizar.';
      return;
    }

    mutationState.value = 'idle';
    setError(error, 'No se pudo recuperar el resultado de la acción.');
  }
}

function clearMessage(): void {
  message.value = null;
  correlationId.value = null;
}

function setError(error: unknown, fallback: string): void {
  if (error instanceof ApiHttpError) {
    correlationId.value = error.correlationId;
    message.value = httpErrorMessage(error, fallback);
  } else if (error instanceof ApiNetworkError) {
    message.value = error.message;
  } else {
    message.value = fallback;
  }
}

function httpErrorMessage(error: ApiHttpError, fallback: string): string {
  if (error.code === 'ORDER_NOT_FOUND') {
    return 'El pedido ya no está disponible para este comercio. Actualizá la bandeja.';
  }
  if (error.code === 'VERSION_CONFLICT') {
    return 'El pedido cambió en otro dispositivo. Actualizá antes de continuar.';
  }
  if (error.code === 'ROLE_FORBIDDEN') {
    return 'No tenés permiso para realizar esta acción.';
  }
  return fallback;
}

function orderStatusLabel(status: string): string {
  return (
    {
      PENDING_MERCHANT: 'Pendiente de revisión',
      ACCEPTED: 'Pedido aceptado',
      PREPARING: 'En preparación',
      READY: 'Listo',
      FULFILLED: 'Entregado',
      COMPLETED: 'Completado',
      CANCELLED: 'Cancelado',
      REJECTED: 'Rechazado',
    }[status] ?? 'Estado actualizado'
  );
}

function paymentStatusLabel(status: string | undefined): string {
  if (status === undefined) return 'Sin pago';
  return (
    {
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
    }[status] ?? 'Estado de pago actualizado'
  );
}

function deliveryStatusLabel(status: string | undefined): string {
  if (status === undefined) return 'Sin entrega';
  return (
    {
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
    }[status] ?? 'Estado de entrega actualizado'
  );
}

function money(cents: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(cents / 100);
}

function shortOrderId(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="eyebrow">Comercio · Fase 4.3</p>
        <h2 class="text-2xl font-semibold">Pedidos para atender</h2>
        <p class="text-sm text-muted-foreground">
          La bandeja muestra únicamente pedidos accionables de tus sucursales autorizadas.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        :disabled="queueState === 'loading' || mutationPending"
        @click="loadActionableOrders()"
      >
        Actualizar bandeja
      </Button>
    </div>

    <Alert v-if="message" aria-live="polite" :variant="detailState === 'error' ? 'destructive' : 'default'">
      <AlertTitle>{{ mutationState === 'uncertain' ? 'Resultado pendiente de verificar' : 'Estado de la operación' }}</AlertTitle>
      <AlertDescription class="space-y-1">
        <p>{{ message }}</p>
        <p v-if="correlationId" class="font-mono text-xs">Código de referencia: {{ correlationId }}</p>
      </AlertDescription>
    </Alert>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Bandeja accionable</CardTitle>
          <CardDescription>Primero aparecen los pedidos que llevan más tiempo esperando.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <template v-if="queueState === 'loading'">
            <Skeleton v-for="index in 3" :key="index" class="h-20 w-full" />
          </template>

          <div v-else-if="queueState === 'ready' && actionableOrders.length === 0" class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            No hay pedidos que requieran una acción del comercio en este momento.
          </div>

          <Button
            v-for="candidate in actionableOrders"
            v-else
            :key="candidate.orderId"
            type="button"
            variant="outline"
            class="h-auto w-full justify-start whitespace-normal p-4 text-left"
            :disabled="mutationPending"
            @click="selectOrder(candidate.orderId)"
          >
            <span class="flex w-full flex-col gap-1">
              <span class="flex items-center justify-between gap-3">
                <strong>Pedido {{ shortOrderId(candidate.orderId) }}</strong>
                <Badge variant="secondary">{{ orderStatusLabel(candidate.status) }}</Badge>
              </span>
              <span class="text-xs text-muted-foreground">
                {{ dateTime(candidate.createdAt) }} · {{ money(candidate.totalCents, candidate.currency) }}
              </span>
            </span>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle autoritativo</CardTitle>
          <CardDescription>
            Productos, importes y estados se vuelven a consultar antes de ejecutar una acción.
          </CardDescription>
        </CardHeader>

        <CardContent v-if="detailState === 'loading'" class="space-y-3">
          <Skeleton class="h-8 w-48" />
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-20 w-full" />
        </CardContent>

        <CardContent v-else-if="selectedOrder" class="space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm text-muted-foreground">Pedido {{ shortOrderId(selectedOrder.id) }}</p>
              <h3 class="text-xl font-semibold">{{ selectedOrder.branch.name }}</h3>
            </div>
            <Badge variant="outline">{{ orderStatusLabel(selectedOrder.status) }}</Badge>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border p-3">
              <p class="text-xs text-muted-foreground">Pedido</p>
              <p class="font-medium">{{ orderStatusLabel(selectedOrder.status) }}</p>
            </div>
            <div class="rounded-lg border p-3">
              <p class="text-xs text-muted-foreground">Pago</p>
              <p class="font-medium">{{ paymentStatusLabel(selectedOrder.payment?.status) }}</p>
            </div>
            <div class="rounded-lg border p-3">
              <p class="text-xs text-muted-foreground">Entrega</p>
              <p class="font-medium">{{ deliveryStatusLabel(selectedOrder.delivery?.status) }}</p>
            </div>
          </div>

          <Separator />

          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-semibold">Productos</h3>
              <strong>{{ money(selectedOrder.totalCents, selectedOrder.currency) }}</strong>
            </div>
            <div v-for="item in selectedOrder.items" :key="item.id" class="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <p class="font-medium">{{ item.name }}</p>
                <p class="text-xs text-muted-foreground">{{ item.quantity }} × {{ money(item.unitPriceCents, selectedOrder.currency) }}</p>
              </div>
              <span class="font-medium">{{ money(item.lineTotalCents, selectedOrder.currency) }}</span>
            </div>
          </div>

          <p class="text-xs text-muted-foreground">
            Última actualización: {{ dateTime(selectedOrder.updatedAt) }}.
          </p>
        </CardContent>

        <CardContent v-else class="text-sm text-muted-foreground">
          Seleccioná un pedido de la bandeja para revisar el detalle vigente.
        </CardContent>

        <CardFooter v-if="selectedOrder" class="flex flex-wrap gap-3 border-t pt-6">
          <Button
            v-if="selectedAction"
            type="button"
            :disabled="mutationPending || detailState === 'loading'"
            @click="executeSelectedAction"
          >
            {{ mutationState === 'submitting' ? 'Confirmando…' : selectedAction.label }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="detailState === 'loading' || mutationPending"
            @click="refreshSelectedOrder()"
          >
            Actualizar pedido
          </Button>
          <p v-if="!selectedAction" class="w-full text-sm text-muted-foreground">
            Este pedido ya no requiere una acción incluida en esta fase del comercio.
          </p>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>
