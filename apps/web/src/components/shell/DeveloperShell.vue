<script setup lang="ts">
import type { CurrentActorResponse } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

defineProps<{
  actor: CurrentActorResponse | null;
  selectedActorId: string;
  actorOptions: ReadonlyArray<{ id: string; label: string }>;
  requestState: 'idle' | 'loading' | 'success' | 'error';
  connectivityLabel: string;
  lastCheckedAt: Date | null;
}>();

const emit = defineEmits<{
  'update:selectedActorId': [value: string];
  refresh: [];
}>();
</script>

<template>
  <main class="app-shell developer-shell">
    <header class="app-header app-header--product">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 48" role="presentation">
            <path d="M3 42 23 14l9 12 7-9 22 25H3Z" />
            <path d="m22 42 10-15 12 15H22Z" />
            <circle cx="49" cy="9" r="5" />
          </svg>
        </div>
        <div>
          <p class="eyebrow">Herramienta interna</p>
          <h1>UspaYa · Desarrollo</h1>
        </div>
      </div>
      <Badge variant="secondary">{{ connectivityLabel }}</Badge>
    </header>

    <section class="workspace-grid developer-context" aria-label="Contexto de desarrollo">
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Diagnóstico</p>
            <h2>Actor sembrado</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            :disabled="requestState === 'loading'"
            @click="emit('refresh')"
          >
            Actualizar
          </Button>
        </div>
        <label class="field-label" for="actor-select">Simular actor</label>
        <select
          id="actor-select"
          class="field-control"
          :value="selectedActorId"
          @change="emit('update:selectedActorId', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in actorOptions" :key="option.id" :value="option.id">
            {{ option.label }}
          </option>
        </select>
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
            <dd>{{ lastCheckedAt?.toLocaleTimeString() ?? '—' }}</dd>
          </div>
        </dl>
      </article>
      <article class="panel">
        <p class="eyebrow">Respuesta autoritativa</p>
        <h2>Identidad efectiva</h2>
        <div v-if="actor" class="actor-summary">
          <strong>{{ actor.displayName }}</strong>
          <span class="mono">{{ actor.userId }}</span>
          <p><strong>Roles:</strong> {{ actor.roles.join(', ') || 'sin roles' }}</p>
          <p><strong>Alcances:</strong> {{ actor.scopes.length }}</p>
        </div>
        <p v-else>La identidad aparecerá después de la comprobación.</p>
      </article>
    </section>

    <slot />
  </main>
</template>
