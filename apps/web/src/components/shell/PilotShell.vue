<script setup lang="ts">
import type { CurrentActorResponse } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

defineProps<{
  actor: CurrentActorResponse | null;
  apiHealthy: boolean;
  connectivityLabel: string;
  loginEmail: string;
  loginPassword: string;
  loginState: 'idle' | 'loading' | 'error';
  loginError: string | null;
}>();

const emit = defineEmits<{
  'update:loginEmail': [value: string];
  'update:loginPassword': [value: string];
  login: [];
  logout: [];
}>();
</script>

<template>
  <main class="pilot-shell">
    <header class="pilot-header">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 48" role="presentation">
            <path d="M3 42 23 14l9 12 7-9 22 25H3Z" />
            <path d="m22 42 10-15 12 15H22Z" />
            <circle cx="49" cy="9" r="5" />
          </svg>
        </div>
        <div>
          <p class="eyebrow">Delivery local de montaña</p>
          <h1>UspaYa</h1>
        </div>
      </div>
      <Badge
        v-if="actor"
        class="pilot-status"
        :data-state="apiHealthy ? 'ok' : 'pending'"
        variant="outline"
      >
        {{ connectivityLabel }}
      </Badge>
    </header>

    <section v-if="!actor" class="pilot-login" aria-labelledby="pilot-login-title">
      <div class="pilot-login-intro">
        <p class="eyebrow">Bienvenido</p>
        <h2 id="pilot-login-title">Pedí cerca, sin vueltas.</h2>
        <p>Iniciá sesión para ver tus pedidos y seguir cada paso hasta la entrega.</p>
      </div>
      <form class="pilot-login-card" @submit.prevent="emit('login')">
        <label class="field-label" for="pilot-login-email">Correo</label>
        <input
          id="pilot-login-email"
          class="field-control"
          type="email"
          autocomplete="email"
          required
          :value="loginEmail"
          @input="emit('update:loginEmail', ($event.target as HTMLInputElement).value)"
        />
        <label class="field-label" for="pilot-login-password">Contraseña</label>
        <input
          id="pilot-login-password"
          class="field-control"
          type="password"
          autocomplete="current-password"
          minlength="12"
          required
          :value="loginPassword"
          @input="emit('update:loginPassword', ($event.target as HTMLInputElement).value)"
        />
        <p v-if="loginError" class="error-box" role="alert">{{ loginError }}</p>
        <Button class="pilot-primary-action" type="submit" :disabled="loginState === 'loading'">
          {{ loginState === 'loading' ? 'Ingresando…' : 'Iniciar sesión' }}
        </Button>
        <p class="pilot-help">¿Necesitás ayuda? Contactá al soporte del piloto.</p>
      </form>
    </section>

    <template v-else>
      <div class="pilot-welcome">
        <div>
          <p class="eyebrow">Tu cuenta</p>
          <h2>Hola, {{ actor.displayName }}</h2>
        </div>
        <Button type="button" variant="ghost" @click="emit('logout')">Salir</Button>
      </div>
      <slot />
      <aside class="pilot-support" aria-label="Ayuda y soporte">
        <strong>¿Necesitás ayuda?</strong>
        <span>Contactá al soporte del piloto antes de repetir una acción o compartir un PIN.</span>
      </aside>
    </template>
  </main>
</template>
