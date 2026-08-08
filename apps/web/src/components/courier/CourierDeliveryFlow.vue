<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  ApiClient,
  ApiHttpError,
  ApiNetworkError,
  type ActiveCourierDeliveryResponse,
  type ConfirmCourierDeliveryResponse,
  type CourierTransitionResponse,
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
import {
  createFinalDeliveryIntent,
  type FinalDeliveryIntent,
} from '@/courier/final-delivery-intent';
import { recoverCourierTransitionDecision, type CourierDeliveryStatus } from '@/courier/recovery';

const props = defineProps<{ actorId: string }>();

type DeliveryDestination = Readonly<{
  addressText: string;
  phone: string;
  reference: string | null;
  lodging: string | null;
  latitude: number | null;
  longitude: number | null;
}>;
type ActiveDelivery = ActiveCourierDeliveryResponse['delivery'] & {
  readonly destination?: DeliveryDestination | null;
};
type MutationState = 'idle' | 'running' | 'uncertain' | 'finalizing' | 'final-uncertain';

const api = new ApiClient();
const delivery = ref<ActiveDelivery | null>(null);
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const mutationState = ref<MutationState>('idle');
const message = ref<string | null>(null);
const messageKind = ref<'info' | 'error'>('info');
const correlationId = ref<string | null>(null);
const merchantResponsible = ref('');
const packageCountInput = ref('1');
const pin = ref('');
const receiver = ref('');
const cashReceivedPesos = ref('');
const finalIntent = ref<FinalDeliveryIntent | null>(null);
const finalResult = ref<ConfirmCourierDeliveryResponse | null>(null);
let generation = 0;

const mutationLocked = computed(() => mutationState.value !== 'idle');
const packageCount = computed(() => Number(packageCountInput.value));
const cashReceivedCents = computed(() => pesosToCents(cashReceivedPesos.value));
const cashDifferenceCents = computed(() => {
  if (delivery.value === null || cashReceivedCents.value === null) return null;
  return cashReceivedCents.value - delivery.value.expectedCashCents;
});
const canConfirmPickup = computed(
  () =>
    delivery.value?.status === 'PICKUP_IN_PROGRESS' &&
    merchantResponsible.value.trim().length > 0 &&
    Number.isSafeInteger(packageCount.value) &&
    packageCount.value >= 1 &&
    !mutationLocked.value,
);
const canConfirmFinal = computed(
  () =>
    delivery.value?.status === 'ARRIVED' &&
    /^\d{4,6}$/.test(pin.value) &&
    receiver.value.trim().length > 0 &&
    cashReceivedCents.value !== null &&
    cashReceivedCents.value === delivery.value.expectedCashCents &&
    !mutationLocked.value,
);

watch(
  () => props.actorId,
  () => {
    generation += 1;
    resetFlow();
    void loadActiveDelivery();
  },
  { immediate: true },
);

async function loadActiveDelivery(preserveMessage = false): Promise<void> {
  const currentGeneration = generation;
  loadState.value = 'loading';
  if (!preserveMessage) clearMessage();

  try {
    const response = await api.getActiveCourierDelivery(props.actorId);
    if (currentGeneration !== generation) return;
    delivery.value = response.delivery;
    loadState.value = 'ready';
  } catch (error) {
    if (currentGeneration !== generation) return;
    if (error instanceof ApiHttpError && error.code === 'DELIVERY_NOT_FOUND') {
      delivery.value = null;
      loadState.value = 'ready';
      return;
    }
    delivery.value = null;
    loadState.value = 'error';
    setError(error, 'No se pudo consultar tu entrega activa.');
  }
}

async function startPickup(): Promise<void> {
  const current = delivery.value;
  if (current?.status !== 'ASSIGNED' || mutationLocked.value) return;

  await runTransition(
    current,
    'ASSIGNED',
    'PICKUP_IN_PROGRESS',
    () => api.startCourierPickup(props.actorId, current.id, current.version),
    'Retiro iniciado. Verificá la entrega con el comercio antes de confirmar la custodia.',
  );
}

async function confirmPickup(): Promise<void> {
  const current = delivery.value;
  if (current?.status !== 'PICKUP_IN_PROGRESS' || !canConfirmPickup.value) return;

  await runTransition(
    current,
    'PICKUP_IN_PROGRESS',
    'PICKED_UP',
    () =>
      api.confirmCourierPickup(
        props.actorId,
        current.id,
        current.version,
        merchantResponsible.value.trim(),
        packageCount.value,
      ),
    'Custodia confirmada. El destino ya está disponible para iniciar el traslado.',
  );
}

async function startDelivery(): Promise<void> {
  const current = delivery.value;
  if (current?.status !== 'PICKED_UP' || mutationLocked.value) return;

  await runTransition(
    current,
    'PICKED_UP',
    'ON_THE_WAY',
    () => api.startCourierDelivery(props.actorId, current.id, current.version),
    'Traslado iniciado. La entrega figura en camino.',
  );
}

async function reportArrival(): Promise<void> {
  const current = delivery.value;
  if (current?.status !== 'ON_THE_WAY' || mutationLocked.value) return;

  await runTransition(
    current,
    'ON_THE_WAY',
    'ARRIVED',
    () => api.reportCourierArrival(props.actorId, current.id, current.version),
    'Llegada registrada. Confirmá receptor, PIN y efectivo antes de cerrar la entrega.',
  );
}

async function runTransition(
  current: ActiveDelivery,
  sourceStatus: CourierDeliveryStatus,
  targetStatus: CourierDeliveryStatus,
  request: () => Promise<CourierTransitionResponse>,
  successMessage: string,
): Promise<void> {
  mutationState.value = 'running';
  clearMessage();

  try {
    const result = await request();
    delivery.value = {
      ...current,
      status: result.status,
      version: result.version,
    };
    mutationState.value = 'idle';
    messageKind.value = 'info';
    message.value = successMessage;
    if (targetStatus === 'PICKED_UP') {
      await loadActiveDelivery(true);
    }
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      messageKind.value = 'info';
      message.value =
        'La conexión se interrumpió después de enviar la acción. Verificamos el estado antes de permitir otro intento.';
      await recoverTransition(current, sourceStatus, targetStatus);
      return;
    }

    mutationState.value = 'idle';
    if (
      error instanceof ApiHttpError &&
      (error.status === 409 || error.code === 'DELIVERY_NOT_FOUND')
    ) {
      correlationId.value = error.correlationId;
      messageKind.value = 'info';
      message.value = 'La entrega cambió. Actualizamos el estado vigente antes de continuar.';
      await loadActiveDelivery(true);
      return;
    }
    setError(error, 'No se pudo confirmar la acción sobre la entrega.');
  }
}

async function recoverTransition(
  previous: ActiveDelivery,
  sourceStatus: CourierDeliveryStatus,
  targetStatus: CourierDeliveryStatus,
): Promise<void> {
  try {
    const response = await api.getActiveCourierDelivery(props.actorId);
    const observed = response.delivery;
    delivery.value = observed;
    mutationState.value = 'idle';

    if (observed.id !== previous.id) {
      message.value =
        'Tu entrega activa cambió. Revisá el estado actualizado antes de realizar otra acción.';
      return;
    }

    const decision = recoverCourierTransitionDecision(observed.status, sourceStatus, targetStatus);
    if (decision === 'confirmed') {
      message.value =
        'El servidor confirma que la acción se aplicó. Mostramos el estado actualizado.';
    } else if (decision === 'retryable') {
      message.value =
        'El servidor confirma que la entrega sigue en el estado anterior. Podés decidir un nuevo intento.';
    } else {
      message.value =
        'La entrega cambió de una forma distinta a la esperada. Revisá el estado antes de continuar.';
    }
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'uncertain';
      message.value =
        'Todavía no podemos verificar la acción. No la repitas hasta recuperar conexión.';
      return;
    }

    mutationState.value = 'idle';
    if (error instanceof ApiHttpError && error.code === 'DELIVERY_NOT_FOUND') {
      delivery.value = null;
      correlationId.value = error.correlationId;
      message.value =
        'La entrega ya no figura activa. No repetimos la acción; consultá a Operaciones si el resultado no es claro.';
      return;
    }
    setError(error, 'No se pudo recuperar el estado de la entrega.');
  }
}

async function confirmFinalDelivery(): Promise<void> {
  const current = delivery.value;
  if (current?.status !== 'ARRIVED' || !canConfirmFinal.value) return;

  const received = cashReceivedCents.value;
  if (received === null) return;

  let intent: FinalDeliveryIntent;
  try {
    intent = createFinalDeliveryIntent(
      current.version,
      current.expectedCashCents,
      pin.value,
      receiver.value,
      received,
    );
  } catch (error) {
    messageKind.value = 'error';
    message.value = error instanceof Error ? error.message : 'Revisá los datos de entrega.';
    return;
  }

  finalIntent.value = intent;
  await sendFinalIntent(current.id, intent);
}

async function retryFinalIntent(): Promise<void> {
  const intent = finalIntent.value;
  const deliveryId = delivery.value?.id;
  if (intent === null || deliveryId === undefined || mutationState.value !== 'final-uncertain')
    return;

  await sendFinalIntent(deliveryId, intent);
}

async function sendFinalIntent(deliveryId: string, intent: FinalDeliveryIntent): Promise<void> {
  mutationState.value = 'finalizing';
  clearMessage();

  try {
    const result = await api.confirmCourierDelivery(
      props.actorId,
      deliveryId,
      intent.idempotencyKey,
      intent.request,
    );
    finishFinalDelivery(result);
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      mutationState.value = 'final-uncertain';
      messageKind.value = 'info';
      message.value =
        'La respuesta de entrega se perdió. Conservamos exactamente la misma intención; usá “Verificar entrega” para recuperar el resultado sin duplicar el cobro.';
      return;
    }

    if (error instanceof ApiHttpError && error.code === 'IDEMPOTENCY_OPERATION_IN_PROGRESS') {
      mutationState.value = 'final-uncertain';
      correlationId.value = error.correlationId;
      messageKind.value = 'info';
      message.value =
        'La confirmación todavía está siendo procesada. Conservamos la misma intención para verificarla nuevamente.';
      return;
    }

    mutationState.value = 'idle';
    finalIntent.value = null;
    if (error instanceof ApiHttpError && error.status === 409) {
      correlationId.value = error.correlationId;
      messageKind.value = 'info';
      message.value =
        'El estado o la intención cambiaron. Actualizamos la entrega antes de permitir una nueva confirmación.';
      await loadActiveDelivery(true);
      return;
    }
    setError(error, finalDeliveryErrorMessage(error));
  }
}

function finishFinalDelivery(result: ConfirmCourierDeliveryResponse): void {
  finalResult.value = result;
  finalIntent.value = null;
  delivery.value = null;
  mutationState.value = 'idle';
  messageKind.value = 'info';
  message.value =
    'Entrega confirmada. El pago quedó confirmado y el pedido fue marcado como entregado.';
  pin.value = '';
  receiver.value = '';
  cashReceivedPesos.value = '';
  merchantResponsible.value = '';
  packageCountInput.value = '1';
}

function finalDeliveryErrorMessage(error: unknown): string {
  if (!(error instanceof ApiHttpError)) return 'No se pudo confirmar la entrega final.';

  const messages: Record<string, string> = {
    INVALID_DELIVERY_PIN:
      'El PIN no es válido. Verificalo con el receptor antes de intentar de nuevo.',
    CASH_AMOUNT_MISMATCH:
      'El efectivo recibido no coincide con el importe esperado. No cierres la diferencia por tu cuenta.',
    DELIVERY_NOT_FOUND: 'La entrega activa ya no está disponible para este repartidor.',
    ROLE_FORBIDDEN: 'No tenés permiso para confirmar esta entrega.',
    IDEMPOTENCY_KEY_CONFLICT:
      'La intención de entrega no coincide con la registrada. No generamos un cobro nuevo; contactá a Operaciones.',
  };
  return messages[error.code] ?? 'No se pudo confirmar la entrega final.';
}

function resetFlow(): void {
  delivery.value = null;
  loadState.value = 'idle';
  mutationState.value = 'idle';
  merchantResponsible.value = '';
  packageCountInput.value = '1';
  pin.value = '';
  receiver.value = '';
  cashReceivedPesos.value = '';
  finalIntent.value = null;
  finalResult.value = null;
  clearMessage();
}

function clearMessage(): void {
  message.value = null;
  messageKind.value = 'info';
  correlationId.value = null;
}

function setError(error: unknown, fallback: string): void {
  mutationState.value = 'idle';
  messageKind.value = 'error';
  if (error instanceof ApiHttpError) {
    correlationId.value = error.correlationId;
    message.value =
      error.code === 'ROLE_FORBIDDEN' ? 'No tenés permiso para esta acción.' : fallback;
  } else if (error instanceof ApiNetworkError) {
    message.value = error.message;
  } else {
    message.value = fallback;
  }
}

function deliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ASSIGNED: 'Entrega asignada',
    PICKUP_IN_PROGRESS: 'Verificando retiro',
    PICKED_UP: 'Custodia confirmada',
    ON_THE_WAY: 'En camino',
    ARRIVED: 'Llegaste al destino',
    DELIVERED: 'Entrega confirmada',
  };
  return labels[status] ?? 'Estado actualizado';
}

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    READY: 'Pedido listo',
    FULFILLED: 'Pedido entregado',
    COMPLETED: 'Pedido cerrado',
  };
  return labels[status] ?? 'Pedido en curso';
}

function nextStepLabel(status: string): string {
  const labels: Record<string, string> = {
    ASSIGNED: 'Iniciá el retiro cuando el pedido esté listo.',
    PICKUP_IN_PROGRESS: 'Verificá responsable y bultos antes de asumir custodia.',
    PICKED_UP: 'Revisá el destino e iniciá el traslado cuando estés listo para salir.',
    ON_THE_WAY: 'Informá la llegada cuando estés en el destino.',
    ARRIVED: 'Confirmá PIN, receptor y efectivo exacto.',
  };
  return labels[status] ?? 'Revisá el estado vigente.';
}

function money(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100);
}

function dateTime(value: string | undefined): string {
  if (value === undefined) return 'sin fecha';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function shortId(value: string): string {
  return value.slice(-8).toUpperCase();
}

function pesosToCents(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (normalized.length === 0) return null;
  const pesos = Number(normalized);
  if (!Number.isFinite(pesos) || pesos < 0) return null;
  const cents = Math.round(pesos * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="eyebrow">Repartidor</p>
        <h2 class="text-2xl font-semibold">Entrega activa</h2>
        <p class="text-sm text-muted-foreground">
          Cada acción usa el estado confirmado por la API. Un problema de red nunca se interpreta
          como éxito ni como rechazo.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        :disabled="loadState === 'loading' || mutationLocked"
        @click="loadActiveDelivery()"
      >
        Actualizar entrega
      </Button>
    </div>

    <Alert
      v-if="message"
      aria-live="polite"
      :variant="messageKind === 'error' ? 'destructive' : 'default'"
    >
      <AlertTitle>
        {{
          mutationState === 'final-uncertain' || mutationState === 'uncertain'
            ? 'Resultado pendiente de verificar'
            : 'Estado de la entrega'
        }}
      </AlertTitle>
      <AlertDescription class="space-y-1">
        <p>{{ message }}</p>
        <p v-if="correlationId" class="font-mono text-xs">
          Código de referencia: {{ correlationId }}
        </p>
      </AlertDescription>
    </Alert>

    <Skeleton v-if="loadState === 'loading'" class="h-72 w-full" />

    <Card v-else-if="delivery">
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Pedido {{ shortId(delivery.orderId) }}</CardTitle>
            <CardDescription>
              {{ delivery.branch.name }} · asignado {{ dateTime(delivery.assignedAt) }}
            </CardDescription>
          </div>
          <Badge variant="outline">{{ deliveryStatusLabel(delivery.status) }}</Badge>
        </div>
      </CardHeader>

      <CardContent class="space-y-5">
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border p-3">
            <p class="text-xs text-muted-foreground">Pedido</p>
            <strong>{{ orderStatusLabel(delivery.orderStatus) }}</strong>
          </div>
          <div class="rounded-lg border p-3">
            <p class="text-xs text-muted-foreground">Entrega</p>
            <strong>{{ deliveryStatusLabel(delivery.status) }}</strong>
          </div>
          <div class="rounded-lg border p-3">
            <p class="text-xs text-muted-foreground">Efectivo esperado</p>
            <strong>{{ money(delivery.expectedCashCents) }}</strong>
          </div>
        </div>

        <div class="rounded-lg bg-muted/40 p-4">
          <p class="text-sm font-medium">Próximo paso</p>
          <p class="text-sm text-muted-foreground">{{ nextStepLabel(delivery.status) }}</p>
        </div>

        <div
          v-if="delivery.destination"
          class="rounded-lg border p-4"
          aria-label="Destino de entrega"
        >
          <p class="text-sm font-semibold">Destino de entrega</p>
          <p class="mt-2 text-sm">
            <strong>Dirección:</strong> {{ delivery.destination.addressText }}
          </p>
          <p class="text-sm"><strong>Teléfono:</strong> {{ delivery.destination.phone }}</p>
          <p v-if="delivery.destination.reference" class="text-sm">
            <strong>Referencia:</strong> {{ delivery.destination.reference }}
          </p>
          <p v-if="delivery.destination.lodging" class="text-sm">
            <strong>Alojamiento:</strong> {{ delivery.destination.lodging }}
          </p>
        </div>

        <template v-if="delivery.status === 'PICKUP_IN_PROGRESS'">
          <Separator />
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="merchant-responsible">Responsable del comercio</Label>
              <Input
                id="merchant-responsible"
                v-model="merchantResponsible"
                autocomplete="off"
                :disabled="mutationLocked"
                placeholder="Nombre o referencia"
              />
            </div>
            <div class="space-y-2">
              <Label for="package-count">Cantidad de bultos</Label>
              <Input
                id="package-count"
                v-model="packageCountInput"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                :disabled="mutationLocked"
              />
            </div>
          </div>
          <p class="text-sm text-muted-foreground">
            Confirmar esta pantalla transfiere la custodia logística. Verificá pedido, responsable y
            bultos antes de continuar.
          </p>
        </template>

        <template v-if="delivery.status === 'ARRIVED'">
          <Separator />
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="delivery-pin">PIN de entrega</Label>
              <Input
                id="delivery-pin"
                v-model="pin"
                type="password"
                inputmode="numeric"
                maxlength="6"
                autocomplete="off"
                :disabled="mutationLocked"
                placeholder="4 a 6 dígitos"
              />
              <p class="text-xs text-muted-foreground">
                El PIN vive solo en memoria y no se guarda en el navegador.
              </p>
            </div>
            <div class="space-y-2">
              <Label for="delivery-receiver">Receptor</Label>
              <Input
                id="delivery-receiver"
                v-model="receiver"
                autocomplete="off"
                :disabled="mutationLocked"
                placeholder="Nombre del receptor"
              />
            </div>
            <div class="space-y-2 sm:col-span-2">
              <Label for="cash-received">Efectivo recibido (ARS)</Label>
              <Input
                id="cash-received"
                v-model="cashReceivedPesos"
                inputmode="decimal"
                :disabled="mutationLocked"
                placeholder="0,00"
              />
              <div class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                <span>Esperado: {{ money(delivery.expectedCashCents) }}</span>
                <span>
                  Recibido:
                  {{ cashReceivedCents === null ? 'sin informar' : money(cashReceivedCents) }}
                </span>
                <span>
                  Diferencia:
                  {{ cashDifferenceCents === null ? '—' : money(cashDifferenceCents) }}
                </span>
              </div>
              <p
                v-if="cashDifferenceCents !== null && cashDifferenceCents !== 0"
                class="text-sm font-medium"
              >
                La diferencia bloquea la confirmación. Informala a Operaciones; no ajustes el total
                por tu cuenta.
              </p>
            </div>
          </div>
        </template>
      </CardContent>

      <CardFooter class="flex flex-wrap gap-2">
        <Button
          v-if="delivery.status === 'ASSIGNED'"
          type="button"
          :disabled="mutationLocked"
          @click="startPickup"
        >
          {{ mutationState === 'running' ? 'Confirmando…' : 'Iniciar retiro' }}
        </Button>

        <Button
          v-else-if="delivery.status === 'PICKUP_IN_PROGRESS'"
          type="button"
          :disabled="!canConfirmPickup"
          @click="confirmPickup"
        >
          {{ mutationState === 'running' ? 'Confirmando…' : 'Confirmar custodia' }}
        </Button>

        <Button
          v-else-if="delivery.status === 'PICKED_UP'"
          type="button"
          :disabled="mutationLocked"
          @click="startDelivery"
        >
          {{ mutationState === 'running' ? 'Confirmando…' : 'Iniciar traslado' }}
        </Button>

        <Button
          v-else-if="delivery.status === 'ON_THE_WAY'"
          type="button"
          :disabled="mutationLocked"
          @click="reportArrival"
        >
          {{ mutationState === 'running' ? 'Confirmando…' : 'Llegué al destino' }}
        </Button>

        <Button
          v-else-if="delivery.status === 'ARRIVED' && mutationState !== 'final-uncertain'"
          type="button"
          :disabled="!canConfirmFinal"
          @click="confirmFinalDelivery"
        >
          {{ mutationState === 'finalizing' ? 'Confirmando…' : 'Confirmar entrega y cobro' }}
        </Button>

        <Button
          v-if="mutationState === 'final-uncertain' && finalIntent"
          type="button"
          @click="retryFinalIntent"
        >
          Verificar entrega
        </Button>
      </CardFooter>
    </Card>

    <Card v-else-if="loadState === 'ready'">
      <CardHeader>
        <CardTitle>No tenés una entrega activa</CardTitle>
        <CardDescription>
          Cuando Operaciones te asigne una entrega aparecerá acá. No se muestran pedidos de otros
          repartidores.
        </CardDescription>
      </CardHeader>
      <CardContent v-if="finalResult" class="space-y-2">
        <Badge variant="outline">Entrega confirmada</Badge>
        <p class="text-sm text-muted-foreground">
          Pedido {{ shortId(finalResult.orderId) }} · pago confirmado · pedido entregado.
        </p>
      </CardContent>
    </Card>

    <Card v-else-if="loadState === 'error'">
      <CardHeader>
        <CardTitle>No pudimos confirmar tu entrega activa</CardTitle>
        <CardDescription>
          Conservá el último estado confirmado y actualizá cuando vuelva la conexión. No repitas una
          acción crítica basándote solo en este error.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button type="button" variant="outline" @click="loadActiveDelivery()"
          >Reintentar consulta</Button
        >
      </CardFooter>
    </Card>
  </div>
</template>
