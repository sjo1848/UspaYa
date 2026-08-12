<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { ApiClient, ApiHttpError, ApiNetworkError, type CurrentActorResponse } from './api/client';
import CourierDeliveryFlow from './components/courier/CourierDeliveryFlow.vue';
import CustomerActiveOrders from './components/customer/CustomerActiveOrders.vue';
import CustomerOrderFlow from './components/customer/CustomerOrderFlow.vue';
import DeveloperShell from './components/shell/DeveloperShell.vue';
import PilotShell from './components/shell/PilotShell.vue';
import MerchantOrderFlow from './components/merchant/MerchantOrderFlow.vue';
import OperationsFlow from './components/operations/OperationsFlow.vue';
import { DEVELOPMENT_ACTORS, findDevelopmentActor } from './dev/actors';

const api = new ApiClient();
const developmentIdentityAvailable = import.meta.env.DEV || import.meta.env.MODE === 'test';
const defaultActor = DEVELOPMENT_ACTORS[0];
if (defaultActor === undefined)
  throw new Error('At least one development actor must be configured.');

const selectedActorId = ref(defaultActor.id);
const requestState = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
const actor = ref<CurrentActorResponse | null>(null);
const loginEmail = ref('');
const loginPassword = ref('');
const loginState = ref<'idle' | 'loading' | 'error'>('idle');
const loginError = ref<string | null>(null);
const apiHealthy = ref(false);
const browserOnline = ref(navigator.onLine);
const lastCheckedAt = ref<Date | null>(null);
const errorMessage = ref<string | null>(null);
const errorCorrelationId = ref<string | null>(null);
let activeRequest: AbortController | null = null;
let refreshTimer: number | null = null;

const selectedActor = computed(() => findDevelopmentActor(selectedActorId.value));
const isCustomerActor = computed(() => actor.value?.roles.includes('CUSTOMER') === true);
const isMerchantActor = computed(() => actor.value?.roles.includes('MERCHANT_OPERATOR') === true);
const isOperationsActor = computed(() => actor.value?.roles.includes('OPERATIONS') === true);
const isCourierActor = computed(() => actor.value?.roles.includes('COURIER') === true);
const activeRoleComponent = computed(() => {
  if (isMerchantActor.value) return MerchantOrderFlow;
  if (isOperationsActor.value) return OperationsFlow;
  if (isCourierActor.value) return CourierDeliveryFlow;
  return null;
});
const connectivityLabel = computed(() => {
  if (!browserOnline.value) return 'Sin conexión';
  if (requestState.value === 'loading') return 'Comprobando conexión';
  if (apiHealthy.value && requestState.value === 'error') return 'Conexión disponible';
  if (apiHealthy.value) return 'Conectado';
  return 'Sin conexión confirmada';
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
    if (health.status !== 'ok') throw new ApiNetworkError('La conexión no está disponible.');
    healthConfirmed = true;
    apiHealthy.value = true;
    if (developmentIdentityAvailable)
      actor.value = await api.currentActor(selectedActorId.value, controller.signal);
    else {
      try {
        applySession(await api.refreshSession(controller.signal));
      } catch (error) {
        if (!(error instanceof ApiHttpError) || error.status !== 401) throw error;
        clearSession();
      }
    }
    requestState.value = 'success';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    apiHealthy.value = healthConfirmed;
    actor.value = null;
    requestState.value = 'error';
    if (error instanceof ApiHttpError) {
      errorMessage.value = `${error.code}: ${error.message}`;
      errorCorrelationId.value = error.correlationId;
    } else if (error instanceof ApiNetworkError) errorMessage.value = error.message;
    else errorMessage.value = 'No se pudo verificar la conexión.';
  } finally {
    if (activeRequest === controller) {
      activeRequest = null;
      lastCheckedAt.value = new Date();
    }
  }
}

function applySession(session: {
  readonly accessToken: string;
  readonly accessTokenExpiresIn: number;
  readonly actor: CurrentActorResponse;
}): void {
  api.setAccessToken(session.accessToken);
  actor.value = session.actor;
  loginPassword.value = '';
  loginError.value = null;
  scheduleRefresh(session.accessTokenExpiresIn);
}

function clearSession(): void {
  api.setAccessToken(null);
  actor.value = null;
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
}

function scheduleRefresh(accessTokenExpiresIn: number): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(
    () => void renewSession(),
    Math.max(30, Math.floor(accessTokenExpiresIn * 0.8)) * 1000,
  );
}

async function renewSession(): Promise<void> {
  try {
    applySession(await api.refreshSession());
  } catch (error) {
    clearSession();
    if (!(error instanceof ApiHttpError) || error.status !== 401)
      errorMessage.value = 'La sesión venció. Volvé a iniciar sesión.';
  }
}

async function submitLogin(): Promise<void> {
  loginState.value = 'loading';
  loginError.value = null;
  try {
    applySession(await api.login(loginEmail.value, loginPassword.value));
    requestState.value = 'success';
  } catch (error) {
    loginState.value = 'error';
    loginError.value =
      error instanceof ApiHttpError && error.status === 401
        ? 'El correo o la contraseña no son válidos.'
        : 'No se pudo iniciar sesión. Intentá nuevamente.';
  } finally {
    loginState.value = 'idle';
  }
}

async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch (error) {
    if (!(error instanceof ApiHttpError) || error.status !== 401)
      errorMessage.value = 'No se pudo cerrar la sesión.';
  } finally {
    clearSession();
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
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});
</script>

<template>
  <DeveloperShell
    v-if="developmentIdentityAvailable"
    :actor="actor"
    :selected-actor-id="selectedActorId"
    :actor-options="DEVELOPMENT_ACTORS"
    :request-state="requestState"
    :connectivity-label="connectivityLabel"
    :last-checked-at="lastCheckedAt"
    @update:selected-actor-id="selectedActorId = $event"
    @refresh="refreshConnection"
  >
    <section v-if="actor" class="app-screen app-screen--customer mt-8 space-y-8">
      <template v-if="isCustomerActor">
        <CustomerActiveOrders :key="`active-${actor.userId}`" :actor-id="actor.userId" />
        <CustomerOrderFlow :key="actor.userId" :actor-id="actor.userId" />
      </template>
      <component
        :is="activeRoleComponent"
        v-else-if="activeRoleComponent"
        :key="actor.userId"
        :actor-id="actor.userId"
      />
    </section>
  </DeveloperShell>

  <PilotShell
    v-else
    :actor="actor"
    :api-healthy="apiHealthy"
    :connectivity-label="connectivityLabel"
    :login-email="loginEmail"
    :login-password="loginPassword"
    :login-state="loginState"
    :login-error="loginError"
    @update:login-email="loginEmail = $event"
    @update:login-password="loginPassword = $event"
    @login="submitLogin"
    @logout="logout"
  >
    <section v-if="actor" class="pilot-content">
      <template v-if="isCustomerActor">
        <CustomerActiveOrders :key="`pilot-active-${actor.userId}`" :actor-id="actor.userId" />
        <CustomerOrderFlow :key="`pilot-order-${actor.userId}`" :actor-id="actor.userId" />
      </template>
      <component
        :is="activeRoleComponent"
        v-else-if="activeRoleComponent"
        :key="`pilot-${actor.userId}`"
        :actor-id="actor.userId"
      />
    </section>
  </PilotShell>
</template>
