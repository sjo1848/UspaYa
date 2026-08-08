from pathlib import Path

path = Path('apps/web/src/components/operations/OperationsFlow.vue')
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'{label} not found')
    text = text.replace(old, new, 1)


replace_once(
    """import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';""",
    """import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';""",
    'select imports',
)

replace_once(
    """const auditOrderId = computed(
  () => selectedCompletion.value?.orderId ?? selectedDelivery.value?.orderId ?? null,
);""",
    """const auditOrderId = computed(() =>
  selectedCompletionOrderId.value.length > 0
    ? selectedCompletionOrderId.value
    : (selectedDelivery.value?.orderId ?? null),
);""",
    'audit order computed',
)

replace_once(
    """    if (
      !pendingCompletion.value.some((order) => order.orderId === selectedCompletionOrderId.value)
    ) {
      selectedCompletionOrderId.value = '';
    }
""",
    '',
    'completion auto-clear',
)

insert_before = """async function assignSelected(): Promise<void> {"""
selection_helpers = """function selectDelivery(deliveryId: string): void {
  if (mutationPending.value) return;
  selectedDeliveryId.value = deliveryId;
  selectedCompletionOrderId.value = '';
  selectedOrder.value = null;
  audit.value = null;
  auditState.value = 'idle';
}

function selectCompletionOrder(orderId: string): void {
  if (mutationPending.value) return;
  selectedCompletionOrderId.value = orderId;
  selectedDeliveryId.value = '';
  selectedCourierId.value = '';
  selectedOrder.value = null;
  audit.value = null;
  auditState.value = 'idle';
}

"""
replace_once(insert_before, selection_helpers + insert_before, 'selection helpers')

replace_once(
    """    selectedCompletionOrderId.value = '';
    await refreshQueues(true);""",
    """    await refreshQueues(true);
    await loadAudit();""",
    'completion success keeps audit target',
)

replace_once(
    """      message.value = 'El servidor confirma que el Pedido quedó completado.';
      selectedCompletionOrderId.value = '';""",
    """      message.value = 'El servidor confirma que el Pedido quedó completado.';
      void loadAudit();""",
    'completion recovery audit',
)

replace_once(
    """function shortId(value: string): string {
  return value.slice(-8).toUpperCase();
}
</script>""",
    """function shortId(value: string): string {
  return value.slice(-8).toUpperCase();
}

function auditActionLabel(action: string): string {
  return (
    {
      SubmitOrder: 'Pedido creado',
      AcceptOrder: 'Pedido aceptado',
      StartOrderPreparation: 'Preparación iniciada',
      MarkOrderReady: 'Pedido listo',
      AssignCourier: 'Repartidor asignado',
      StartPickup: 'Retiro iniciado',
      ConfirmPickup: 'Retiro confirmado',
      StartDelivery: 'Traslado iniciado',
      ReportCourierArrival: 'Llegada informada',
      ConfirmDelivery: 'Entrega confirmada',
      ConfirmPayment: 'Pago confirmado',
      MarkOrderFulfilled: 'Pedido entregado',
      ReleaseCourierAssignment: 'Asignación liberada',
      CompleteOrder: 'Pedido completado',
    }[action] ?? 'Evento operativo'
  );
}
</script>""",
    'audit label helper',
)

replace_once(
    '          <CardDescription>Entregas READY que todavía requieren asignación manual.</CardDescription>',
    '          <CardDescription>Pedidos listos que todavía requieren asignación manual.</CardDescription>',
    'technical READY copy',
)

replace_once(
    '@click="selectedDeliveryId = delivery.id"',
    '@click="selectDelivery(delivery.id)"',
    'delivery selection click',
)

replace_once(
    """            <select
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
            </select>""",
    """            <Select v-model="selectedCourierId" :disabled="mutationPending">
              <SelectTrigger id="operations-courier" class="w-full">
                <SelectValue placeholder="Seleccionar repartidor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="courier in couriers"
                  :key="courier.courierId"
                  :value="courier.courierId"
                >
                  {{ courier.displayName }}
                </SelectItem>
              </SelectContent>
            </Select>""",
    'native courier select',
)

replace_once(
    """          <Button
            type="button"
            :disabled="selectedCourierId.length === 0 || mutationPending"
            @click="assignSelected"
          >
            {{ mutationState === 'assigning' ? 'Asignando…' : 'Asignar repartidor' }}
          </Button>""",
    """          <Button
            type="button"
            :disabled="selectedCourierId.length === 0 || mutationPending"
            @click="assignSelected"
          >
            {{ mutationState === 'assigning' ? 'Asignando…' : 'Asignar repartidor' }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="auditState === 'loading' || mutationPending"
            @click="loadAudit"
          >
            Ver auditoría
          </Button>""",
    'assignment audit button',
)

replace_once(
    '@click="selectedCompletionOrderId = order.orderId"',
    '@click="selectCompletionOrder(order.orderId)"',
    'completion selection click',
)

replace_once(
    """                <span class="text-xs text-muted-foreground">
                  {{ order.branch.name }} · {{ money(order.totalCents, order.currency) }} ·
                  {{ dateTime(order.updatedAt) }}
                </span>""",
    """                <span class="text-xs text-muted-foreground">
                  {{ order.branch.name }} · {{ money(order.totalCents, order.currency) }} ·
                  {{ dateTime(order.updatedAt) }}
                </span>
                <span class="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Pago confirmado</span>
                  <span>Entrega realizada</span>
                </span>""",
    'completion separated cycles',
)

replace_once(
    '<strong>{{ entry.action }}</strong>',
    '<strong>{{ auditActionLabel(entry.action) }}</strong>',
    'audit technical action',
)

path.write_text(text)
