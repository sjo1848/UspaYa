<script setup lang="ts">
import { APP_META } from './app-meta';
</script>

<template>
  <main class="shell">
    <section class="status-card" aria-labelledby="app-title">
      <p class="eyebrow">Fundación técnica</p>
      <h1 id="app-title">{{ APP_META.name }}</h1>
      <p>
        El monorepo está listo para incorporar la primera vertical técnica. Esta pantalla no
        representa todavía un piloto operativo ni un lanzamiento público.
      </p>
      <dl>
        <div>
          <dt>Etapa</dt>
          <dd>{{ APP_META.stage }}</dd>
        </div>
        <div>
          <dt>Piloto real</dt>
          <dd>{{ APP_META.pilotReady ? 'habilitado' : 'no habilitado' }}</dd>
        </div>
        <div>
          <dt>Lanzamiento público</dt>
          <dd>{{ APP_META.publicReleaseReady ? 'habilitado' : 'no habilitado' }}</dd>
        </div>
      </dl>
    </section>
  </main>
</template>
