# ADR-003 — Stack técnico y estructura del repositorio

**Estado:** ACCEPTED

## Stack

- pnpm workspaces;
- TypeScript estricto;
- NestJS para `apps/api`;
- Vue 3 + Vite para `apps/web`;
- worker Node/Nest para Outbox;
- PostgreSQL;
- Prisma ORM y Prisma Migrate;
- OpenAPI;
- Docker Compose;
- GitHub Actions;
- Jest, Vitest y Playwright.

## Estructura

```text
apps/
  api/
  web/
  worker/
packages/
  contracts/
  config/
  testing/
  ui/
docs/
infra/
.github/
```

## Backend

```text
modules/<module>/
  domain/
  application/
  infrastructure/
  interface/
  tests/
```

`domain` no depende de NestJS, Prisma ni HTTP. Prisma se mantiene detrás de repositorios y mapeadores.

## API

- REST JSON;
- prefijo `/api/v1`;
- validación en frontera;
- errores estables con `correlationId`;
- `Idempotency-Key` en mutaciones críticas;
- versión explícita para concurrencia;
- OpenAPI generado.

## PWA

La web prioriza responsive, accesibilidad y estados de recuperación. No se promete operación offline completa en la primera vertical.

## No decisiones

- proveedor de autenticación real;
- hosting definitivo;
- broker;
- Kubernetes;
- aplicación nativa.

Se resolverán cuando exista evidencia o una necesidad de implementación concreta.
