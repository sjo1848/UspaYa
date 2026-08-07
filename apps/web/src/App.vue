<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { ApiClient, ApiHttpError, ApiNetworkError, type CurrentActorResponse } from './api/client';
import { APP_META } from './app-meta';
import CustomerOrderFlow from './components/customer/CustomerOrderFlow.vue';
import MerchantOrderFlow from './components/merchant/MerchantOrderFlow.vue';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { DEVELOPMENT_ACTORS, findDevelopmentActor } from './dev/actors';

const api = new ApiClient();
const developmentIdentityAvailable = import.meta.env.DEV || import.meta.env.MODE === 'test';
const defaultActor = DEVELOPMENT_ACTORS[0];
if (defaultActor === undefined) {
  throw new Error('At least one development actor must be configured.');
}

const selectedActorId = ref(defaultActor.id);
const requestState = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
const actor = ref<CurrentActorResponse | null>(null);
const apiHealthy = ref(false);
const browserOnline = ref(navigator.onLine);
const lastCheckedAt = ref<Date | null>(null);
const errorMessage = ref<string | null>(null);
const errorCorrelationId = ref<string | null>(null);
let activeRequest: AbortController | null = null;

const selectedActor = computed(() => findDevelopmentActor(selectedActorId.value));
const isCustomerActor = computed(() => actor.value?.roles.includes('CUSTOMER') === true);
const isMerchantActor = computed(() => actor.value?.roles.includes('MERCHANT_OPERATOR') === true);
const connectivityLabel = computed(() => {
  if (!browserOnline.value) return 'Sin conexión del dispositivo';
  if (requestState.value === 'loading') return 'Comprobando API';
  if (apiHealthy.value && requestState.value === 'error') {
    return 'API disponible; identidad no confirmada';
  }
  if (apiHealthy.value) return 'API disponible';
  return 'API no confirmada';
});

async function refreshConnection(): Promise<void> {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  requestState.value = 'loading';
  errorMessage.value = null;
  errorCorrelationId.value = null;
  let healthConfirmed = false;

  try {
    const health = await api.health(controller.signal);
    if (health.status !== 'ok') {
      throw new ApiNetworkError('La API respondió, pero no confirmó un estado saludable.');
    }
    healthConfirmed = true;
    apiHealthy.value = true;

    actor.value = developmentIdentityAvailable
      ? await api.currentActor(selectedActorId.value, controller.signal)
      : null;
    requestState.value = 'success';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;

    apiHealthy.value = healthConfirmed;
    actor.value = null;
    requestState.value = 'error';
    if (error instanceof ApiHttpError) {
      errorMessage.value = `${error.code}: ${error.message}`;
      errorCorrelationId.value = error.correlationId;
    } else if (error instanceof ApiNetworkError) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value = 'No se pudo verificar el estado actual.';
    }
  } finally {
    if (activeRequest === controller) {
      activeRequest = null;
      lastCheckedAt.value = new Date();
    }
  }
}

function handleOnline(): void {
  browserOnline.value = true;
  void refreshConnection();
}

function handleOffline(): void {
  browserOnline.value = false;
  apiHealthy.value = false;
}

watch(selectedActorId, () => {
  if (developmentIdentityAvailable) void refreshConnection();
});

onMounted(() => {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  void refreshConnection();
});

onBeforeUnmount(() => {
  activeRequest?.abort();
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Primera vertical funcional</p>
        <h1>{{ APP_META.name }}</h1>
        <p class="lede">
          Base de interfaz conectada a la API autoritativa. El selector de actor es una herramienta
          de desarrollo y no representa autenticación productiva.
        </p>
      </div>
      <Badge
        class="status-pill"
        :variant="apiHealthy ? 'outline' : 'secondary'"
        :data-state="apiHealthy ? 'ok' : 'pending'"
      >
        {{ connectivityLabel }}
      </Badge>
    </header>

    <section class="workspace-grid" aria-label="Estado de integración frontend">
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Contexto</p>
            <h2>Actor de desarrollo</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            :disabled="requestState === 'loading'"
            @click="refreshConnection"
          >
            Actualizar
          </Button>
        </div>

        <template v-if="developmentIdentityAvailable">
          <label class="field-label" for="actor-select">Simular actor sembrado</label>
          <select id="actor-select" v-model="selectedActorId" class="field-control">
            <option v-for="option in DEVELOPMENT_ACTORS" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
          <p class="field-help">
            Selección actual: {{ selectedActor?.label ?? 'desconocida' }}. Los permisos reales se
            vuelven a consultar al backend.
          </p>
        </template>
        <p v-else class="notice">
          El selector de identidad está deshabilitado en builds que no son de desarrollo o test.
        </p>

        <dl class="facts">
          <div>
            <dt>Estado</dt>
            <dd>{{ requestState }}</dd>
          </div>
          <div>
            <dt>Conectividad</dt>
            <dd>{{ connectivityLabel }}</dd>
          </div>
          <div>
            <dt>Última comprobación</dt>
            <dd>{{ lastCheckedAt?.toLocaleTimeString() ?? 'todavía no ejecutada' }}</dd>
          </div>
        </dl>
      </article>

      <article class="panel" aria-live="polite">
        <p class="eyebrow">Identidad efectiva</p>
        <h2>Respuesta autoritativa</h2>

        <p v-if="requestState === 'loading'">Consultando salud e identidad…</p>
        <div v-else-if="actor" class="actor-summary">
          <strong>{{ actor.displayName }}</strong>
          <span class="mono">{{ actor.userId }}</span>
          <p><strong>Roles:</strong> {{ actor.roles.join(', ') || 'sin roles' }}</p>
          <p><strong>Alcances:</strong> {{ actor.scopes.length }}</p>
        </div>
        <div v-else-if="errorMessage" class="error-box" role="alert">
          <strong>No se confirmó el estado.</strong>
          <p>{{ errorMessage }}</p>
          <p v-if="errorCorrelationId" class="mono">Correlation ID: {{ errorCorrelationId }}</p>
          <p>
            No se asume que una acción haya fallado o sido confirmada únicamente por un problema de
            red.
          </p>
        </div>
        <p v-else>La identidad efectiva aparecerá después de la primera comprobación.</p>
      </article>
    </section>

    <section v-if="isCustomerActor" class="mt-8">
      <CustomerOrderFlow :key="actor?.userId" :actor-id="actor?.userId ?? selectedActorId" />
    </section>

    <section v-else-if="isMerchantActor" class="mt-8">
      <MerchantOrderFlow :key="actor?.userId" :actor-id="actor?.userId ?? selectedActorId" />
    </section>

    <section v-else-if="actor" class="guardrail" aria-labelledby="guardrail-title">
      <div>
        <p class="eyebrow">Fase 4</p>
        <h2 id="guardrail-title">Superficie {{ selectedActor?.label }} pendiente</h2>
      </div>
      <p>
        Cliente y comercio ya tienen superficies funcionales de la primera vertical. Operaciones y
        reparto se incorporan en incrementos separados y mantienen sus permisos autoritativos en la
        API.
      </p>
    </section>
  </main>
</template>
