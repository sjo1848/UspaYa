<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  ApiClient,
  ApiHttpError,
  ApiNetworkError,
  type AvailableCourierResponse,
  type OrderAuditResponse,
  type OrderProjectionResponse,
  type PendingCompletionOrderResponse,
  type UnassignedDeliveryResponse,
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
import { recoverAssignmentDecision, recoverCompletionDecision } from '@/operations/recovery';

const props = defineProps<{ actorId: string }>();

const api = new ApiClient();
const deliveries = ref<readonly UnassignedDeliveryResponse[]>([]);
const couriers = ref<readonly AvailableCourierResponse[]>([]);
const pendingCompletion = ref<readonly PendingCompletionOrderResponse[]>([]);
const selectedDeliveryId = ref('');
const selectedCourierId = ref('');
const selectedCompletionOrderId = ref('');
const selectedOrder = ref<OrderProjectionResponse | null>(null);
const audit = ref<OrderAuditResponse | null>(null);
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const mutationState = ref<'idle' | 'assigning' | 'completing' | 'uncertain'>('idle');
const auditState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const message = ref<string | null>(null);
const correlationId = ref<string | null>(null);
let generation = 0;

const selectedDelivery = computed(
  () => deliveries.value.find((delivery) => delivery.id === selectedDeliveryId.value) ?? null,
);
const selectedCompletion = computed(
  () =>
    pendingCompletion.value.find((order) => order.orderId === selectedCompletionOrderId.value) ??
    null,
);
const mutationPending = computed(() => mutationState.value !== 'idle');
const auditOrderId = computed(
  () => selectedCompletion.value?.orderId ?? selectedDelivery.value?.orderId ?? null,
);

watch(
  () => props.actorId,
  () => {
    generation += 1;
    deliveries.value = [];
    couriers.value = [];
    pendingCompletion.value = [];
    selectedDeliveryId.value = '';
    selectedCourierId.value = '';
    selectedCompletionOrderId.value = '';
    selectedOrder.value = null;
    audit.value = null;
    clearMessage();
    void refreshQueues();
  },
  { immediate: true },
);

async function refreshQueues(preserveMessage = false): Promise<void> {
  const currentGeneration = generation;
  loadState.value = 'loading';
  if (!preserveMessage) clearMessage();

  try {
    const [unassigned, available, completable] = await Promise.all([
      api.listUnassignedDeliveries(props.actorId),
      api.listAvailableCouriers(props.actorId),
      api.listPendingCompletionOrders(props.actorId),
    ]);
    if (currentGeneration !== generation) return;

    deliveries.value = unassigned.deliveries;
    couriers.value = available;
    pendingCompletion.value = completable;
    loadState.value = 'ready';

    if (!deliveries.value.some((delivery) => delivery.id === selectedDeliveryId.value)) {
      selectedDeliveryId.value = '';
    }
    if (!couriers.value.some((courier) => courier.courierId === selectedCourierId.value)) {
      selectedCourierId.value = '';
    }
    if (
      !pendingCompletion.value.some((order) => order.orderId === selectedCompletionOrderId.value)
    ) {
      selectedCompletionOrderId.value = '';
    }
  } catch (error) {
    if (currentGeneration !== generation) return;
    loadState.value = 'error';
    setError(error, 'No se pudieron actualizar las colas de Operaciones.');
  }
}

async function assignSelected(): Promise<void> {
  const delivery = selectedDelivery.value;
  const courierId = selectedCourierId.value;
  if (delivery === null || courierId.length === 0 || mutationPending.value) return;

  mutationState.value = 'assigning';
  clearMessage();

  try {
    await api.assignCourier(props.actorId, delivery.id, courierId, delivery.version);
    mutationState.value = 'idle';
    message.value = 'Repartidor asignado. Actualizamos la cola autoritativa.';
    selectedDeliveryId.value = '';
    selectedCourierId.value = '';
    await refreshQueues(true);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      message.value =
        'La conexión se interrumpió durante la asignación. Verificamos el Pedido antes de repetir.';
      await recoverAssignment(delivery, courierId);
      return;
    }

    mutationState.value = 'idle';
    if (
      error instanceof ApiHttpError &&
      ['VERSION_CONFLICT', 'COURIER_NOT_AVAILABLE', 'ACTIVE_COURIER_ASSIGNMENT_CONFLICT'].includes(
        error.code,
      )
    ) {
      correlationId.value = error.correlationId;
      message.value =
        'La disponibilidad cambió. Actualizamos entregas y repartidores antes de continuar.';
      await refreshQueues(true);
      return;
    }
    setError(error, 'No se pudo asignar el repartidor.');
  }
}

async function recoverAssignment(
  delivery: UnassignedDeliveryResponse,
  courierId: string,
): Promise<void> {
  try {
    const order = await api.getOrder(props.actorId, delivery.orderId);
    selectedOrder.value = order;
    mutationState.value = 'idle';

    const decision = recoverAssignmentDecision(order, courierId);
    if (decision === 'confirmed') {
      message.value = 'El servidor confirma que la asignación se realizó.';
      selectedDeliveryId.value = '';
      selectedCourierId.value = '';
    } else if (decision === 'retryable') {
      message.value =
        'La entrega sigue sin asignar. El estado ya fue verificado y podés decidir un nuevo intento.';
    } else {
      message.value =
        'La entrega cambió de otra forma. Actualizamos las colas antes de permitir una nueva acción.';
    }
    await refreshQueues(true);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      message.value =
        'Todavía no podemos verificar la asignación. No repitas la acción hasta recuperar conexión.';
      return;
    }
    mutationState.value = 'idle';
    setError(error, 'No se pudo recuperar el resultado de la asignación.');
  }
}

async function completeSelected(): Promise<void> {
  const candidate = selectedCompletion.value;
  if (candidate === null || mutationPending.value) return;

  mutationState.value = 'completing';
  clearMessage();

  try {
    await api.completeOrder(props.actorId, candidate.orderId, candidate.version);
    mutationState.value = 'idle';
    message.value = 'Pedido cerrado correctamente.';
    selectedCompletionOrderId.value = '';
    await refreshQueues(true);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      message.value =
        'La conexión se interrumpió durante el cierre. Verificamos el Pedido antes de repetir.';
      await recoverCompletion(candidate);
      return;
    }

    mutationState.value = 'idle';
    if (error instanceof ApiHttpError && error.code === 'VERSION_CONFLICT') {
      correlationId.value = error.correlationId;
      message.value = 'El Pedido cambió. Actualizamos el estado vigente antes de otra acción.';
      await refreshQueues(true);
      return;
    }
    setError(error, 'No se pudo cerrar el Pedido.');
  }
}

async function recoverCompletion(candidate: PendingCompletionOrderResponse): Promise<void> {
  try {
    const order = await api.getOrder(props.actorId, candidate.orderId);
    selectedOrder.value = order;
    mutationState.value = 'idle';

    const decision = recoverCompletionDecision(order);
    if (decision === 'confirmed') {
      message.value = 'El servidor confirma que el Pedido quedó completado.';
      selectedCompletionOrderId.value = '';
    } else if (decision === 'retryable') {
      message.value =
        'El Pedido continúa pendiente de cierre. El estado fue verificado antes de una nueva acción.';
    } else {
      message.value =
        'El Pedido cambió y ya no cumple el estado esperado. Actualizamos las colas antes de continuar.';
    }
    await refreshQueues(true);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      message.value =
        'Todavía no podemos verificar el cierre. No repitas la acción hasta recuperar conexión.';
      return;
    }
    mutationState.value = 'idle';
    setError(error, 'No se pudo recuperar el resultado del cierre.');
  }
}

async function loadAudit(): Promise<void> {
  const orderId = auditOrderId.value;
  if (orderId === null) return;

  auditState.value = 'loading';
  clearMessage();
  try {
    audit.value = await api.getOrderAudit(props.actorId, orderId);
    auditState.value = 'ready';
  } catch (error) {
    auditState.value = 'error';
    setError(error, 'No se pudo consultar la auditoría del Pedido.');
  }
}

function clearMessage(): void {
  message.value = null;
  correlationId.value = null;
}

function setError(error: unknown, fallback: string): void {
  if (error instanceof ApiHttpError) {
    correlationId.value = error.correlationId;
    message.value =
      error.code === 'ROLE_FORBIDDEN' ? 'No tenés permiso para realizar esta acción.' : fallback;
  } else if (error instanceof ApiNetworkError) {
    message.value = error.message;
  } else {
    message.value = fallback;
  }
}

function money(cents: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(cents / 100);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function shortId(value: string): string {
  return value.slice(-8).toUpperCase();
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="eyebrow">Operaciones · Fase 4.4</p>
        <h2 class="text-2xl font-semibold">Colas operativas</h2>
        <p class="text-sm text-muted-foreground">
          Asignación y cierre usan el estado autoritativo; una lista visible nunca reemplaza la
          validación del backend.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        :disabled="loadState === 'loading' || mutationPending"
        @click="refreshQueues()"
      >
        Actualizar colas
      </Button>
    </div>

    <Alert
      v-if="message"
      aria-live="polite"
      :variant="loadState === 'error' ? 'destructive' : 'default'"
    >
      <AlertTitle>
        {{
          mutationState === 'uncertain'
            ? 'Resultado pendiente de verificar'
            : 'Estado de la operación'
        }}
      </AlertTitle>
      <AlertDescription class="space-y-1">
        <p>{{ message }}</p>
        <p v-if="correlationId" class="font-mono text-xs">
          Código de referencia: {{ correlationId }}
        </p>
      </AlertDescription>
    </Alert>

    <div v-if="loadState === 'loading'" class="grid gap-4 lg:grid-cols-2">
      <Skeleton class="h-80 w-full" />
      <Skeleton class="h-80 w-full" />
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Listos sin repartidor</CardTitle>
          <CardDescription>Entregas READY que todavía requieren asignación manual.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div
            v-if="deliveries.length === 0"
            class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
          >
            No hay entregas pendientes de asignación.
          </div>
          <div v-else class="space-y-2">
            <Button
              v-for="delivery in deliveries"
              :key="delivery.id"
              type="button"
              :variant="selectedDeliveryId === delivery.id ? 'secondary' : 'outline'"
              class="h-auto w-full justify-start p-4 text-left"
              :disabled="mutationPending"
              @click="selectedDeliveryId = delivery.id"
            >
              <span class="flex w-full flex-col gap-1">
                <span class="flex items-center justify-between gap-2">
                  <strong>Pedido {{ shortId(delivery.orderId) }}</strong>
                  <Badge variant="outline">Sin repartidor</Badge>
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ delivery.branch.name }} · {{ money(delivery.orderTotalCents) }} ·
                  {{ dateTime(delivery.orderCreatedAt) }}
                </span>
              </span>
            </Button>
          </div>

          <template v-if="selectedDelivery">
            <Separator />
            <label class="text-sm font-medium" for="operations-courier">
              Repartidor disponible
            </label>
            <select
              id="operations-courier"
              v-model="selectedCourierId"
              class="field-control"
              :disabled="mutationPending"
            >
              <option value="">Seleccionar repartidor</option>
              <option
                v-for="courier in couriers"
                :key="courier.courierId"
                :value="courier.courierId"
              >
                {{ courier.displayName }}
              </option>
            </select>
            <p v-if="couriers.length === 0" class="text-sm text-muted-foreground">
              No hay repartidores disponibles. La entrega permanece sin asignar.
            </p>
          </template>
        </CardContent>
        <CardFooter v-if="selectedDelivery" class="border-t pt-6">
          <Button
            type="button"
            :disabled="selectedCourierId.length === 0 || mutationPending"
            @click="assignSelected"
          >
            {{ mutationState === 'assigning' ? 'Asignando…' : 'Asignar repartidor' }}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos pendientes de cierre</CardTitle>
          <CardDescription>
            Entregados, con cobro confirmado y sin asignación activa.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <div
            v-if="pendingCompletion.length === 0"
            class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
          >
            No hay pedidos pendientes de cierre.
          </div>
          <template v-else>
            <Button
              v-for="order in pendingCompletion"
              :key="order.orderId"
              type="button"
              :variant="selectedCompletionOrderId === order.orderId ? 'secondary' : 'outline'"
              class="h-auto w-full justify-start p-4 text-left"
              :disabled="mutationPending"
              @click="selectedCompletionOrderId = order.orderId"
            >
              <span class="flex w-full flex-col gap-1">
                <span class="flex items-center justify-between gap-2">
                  <strong>Pedido {{ shortId(order.orderId) }}</strong>
                  <Badge variant="outline">Listo para cerrar</Badge>
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ order.branch.name }} · {{ money(order.totalCents, order.currency) }} ·
                  {{ dateTime(order.updatedAt) }}
                </span>
              </span>
            </Button>
          </template>
        </CardContent>
        <CardFooter v-if="selectedCompletion" class="flex gap-3 border-t pt-6">
          <Button type="button" :disabled="mutationPending" @click="completeSelected">
            {{ mutationState === 'completing' ? 'Cerrando…' : 'Completar pedido' }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="auditState === 'loading' || mutationPending"
            @click="loadAudit"
          >
            Ver auditoría
          </Button>
        </CardFooter>
      </Card>
    </div>

    <Card v-if="auditOrderId">
      <CardHeader>
        <CardTitle>Auditoría del Pedido {{ shortId(auditOrderId) }}</CardTitle>
        <CardDescription>Vista acotada y sanitizada por backend.</CardDescription>
      </CardHeader>
      <CardContent>
        <p v-if="auditState === 'idle'" class="text-sm text-muted-foreground">
          Usá “Ver auditoría” para cargar el historial.
        </p>
        <p v-else-if="auditState === 'loading'" class="text-sm text-muted-foreground">
          Consultando auditoría…
        </p>
        <div v-else-if="audit?.entries.length" class="space-y-2">
          <div
            v-for="entry in audit.entries"
            :key="`${entry.aggregateType}-${entry.aggregateId}-${entry.createdAt}-${entry.action}`"
            class="rounded-lg border p-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <strong>{{ entry.action }}</strong>
              <span class="text-xs text-muted-foreground">{{ dateTime(entry.createdAt) }}</span>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ entry.aggregateType }} · versión {{ entry.aggregateVersion ?? 'sin versión' }} ·
              actor {{ entry.actorId ? shortId(entry.actorId) : 'sistema' }}
            </p>
          </div>
        </div>
        <p v-else-if="auditState === 'ready'" class="text-sm text-muted-foreground">
          No hay entradas de auditoría para mostrar.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
