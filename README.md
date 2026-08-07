# UspaYa

Plataforma local de pedidos y logística de última milla para Uspallata, Mendoza.

## Estado

**PHASE 3 — CONTROLLED API IMPLEMENTATION IN PROGRESS**

Ya están implementados y fusionados el núcleo de dominio, persistencia transaccional, auditoría,
idempotencia, Outbox, worker y la frontera REST inicial. La vertical completa todavía está en
construcción.

El proyecto continúa:

- **NOT READY FOR CLOSED PILOT**
- **NOT READY FOR PUBLIC RELEASE**

El código utiliza actores y datos ficticios. No implica lanzamiento ni aprobación de tarifas,
participantes o decisiones comerciales pendientes.

## Primera vertical

```text
SubmitOrder
→ PENDING_MERCHANT
→ ACCEPTED
→ PREPARING
→ READY
→ ASSIGNED
→ PICKED_UP
→ ON_THE_WAY
→ ARRIVED
→ DELIVERED / FULFILLED
→ COMPLETED
```

Condiciones iniciales:

- un comercio y una sucursal por pedido;
- `USPAYA_DELIVERY`;
- efectivo contra entrega;
- asignación manual;
- un repartidor con una entrega activa;
- actores y datos sembrados.

## Capacidades disponibles

- API versionada bajo `/api/v1`;
- healthcheck y OpenAPI;
- identidad segura de desarrollo;
- autorización por rol y alcance;
- catálogo activo por sucursal;
- creación idempotente de pedidos;
- consulta protegida de pedidos;
- aceptación, inicio de preparación y marcado `READY` por el comercio;
- cola operativa de entregas `READY` y asignación manual de repartidor;
- versión esperada, auditoría y Outbox en mutaciones implementadas;
- PostgreSQL, migraciones y seeds reproducibles;
- pruebas unitarias, de integración HTTP y smoke tests en CI.

Todavía faltan retiro, traslado, llegada, entrega, cierre del Pedido y frontend funcional.

## Arquitectura aceptada

- monolito modular;
- monorepo TypeScript con pnpm workspaces;
- API NestJS;
- web Vue 3 + Vite, preparada como PWA;
- PostgreSQL;
- Prisma ORM y migraciones;
- Outbox transaccional mínimo y worker sin broker externo;
- OpenAPI;
- Docker Compose;
- GitHub Actions;
- `node:test` para el núcleo actual; pruebas de frontend y E2E se incorporarán cuando exista la
  superficie funcional correspondiente.

## Documentación de implementación

- [`GATE-001`](docs/00-governance/GATE-001-technical-readiness.md)
- [`MVP-001`](docs/01-product/MVP-001-pilot-scope.md)
- [`Order lifecycle`](docs/02-domain/order-lifecycle.md)
- [`Order transition matrix`](docs/02-domain/order-transition-matrix.md)
- [`ADR-001`](docs/03-architecture/ADR-001-modular-monolith.md)
- [`ADR-002`](docs/03-architecture/ADR-002-outbox.md)
- [`ADR-003`](docs/03-architecture/ADR-003-technology-stack.md)
- [`DEV-001`](docs/04-application/DEV-001-first-vertical.md)
- [`API-001`](docs/04-application/API-001-rest-contract.md)
- [`Persistence contract`](docs/04-application/persistence-contract.md)
- [`QA critical scenarios`](docs/05-qa/critical-order-scenarios.md)
- [`Outbox operations`](docs/06-operations/outbox-operations.md)

## Requisitos de desarrollo

- Node.js `24.18.0`;
- pnpm `11.15.1`;
- Docker Engine con Compose v2.

## Inicio local completo

```bash
nvm install
nvm use
corepack enable
corepack prepare pnpm@11.15.1 --activate

pnpm install --frozen-lockfile
cp .env.example .env
pnpm prisma:generate

docker compose up -d postgres
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Los scripts raíz que requieren configuración cargan `.env` mediante
`infra/scripts/run-with-env.mjs`.

Servicios:

- API: `http://localhost:3000/api/v1/health`
- OpenAPI: `http://localhost:3000/api/v1/docs`
- Web: `http://localhost:5173`
- PostgreSQL: `localhost:5432`
- Worker: proceso Nest conectado al Outbox local.

## Identidad de desarrollo

Los endpoints protegidos utilizan `x-dev-actor-id` únicamente cuando
`DEV_IDENTITY_ENABLED=true` y `NODE_ENV` es `development` o `test`.

| Actor       | ID                                     |
| ----------- | -------------------------------------- |
| Cliente     | `11111111-1111-4111-8111-111111111111` |
| Comercio    | `22222222-2222-4222-8222-222222222222` |
| Operaciones | `33333333-3333-4333-8333-333333333333` |
| Repartidor  | `44444444-4444-4444-8444-444444444444` |

Ejemplo:

```bash
curl --fail \
  -H 'x-dev-actor-id: 11111111-1111-4111-8111-111111111111' \
  http://localhost:3000/api/v1/actors/me
```

La aplicación falla cerrada si el bypass se intenta habilitar sin un entorno expresamente
permitido. No existe autenticación productiva todavía.

## Calidad

```bash
pnpm check
pnpm test:integration
```

`pnpm check` ejecuta generación de Prisma Client, formato, lint, typecheck, pruebas unitarias y
builds. Las pruebas de integración requieren PostgreSQL migrado y sembrado.

## Estructura

```text
apps/
  api/
  web/
  worker/
packages/
  contracts/
  config/
  database/
  testing/
  ui/
infra/
  docker/
  scripts/
docs/
.github/
```

## Principios

1. Pedido, Pago, Entrega e Incidencia mantienen ciclos independientes.
2. Las mutaciones críticas son autorizadas, auditadas y seguras ante concurrencia.
3. La idempotencia se aplica cuando un reintento puede duplicar efectos.
4. Una notificación fallida no revierte una transición confirmada.
5. Las decisiones provisionales se configuran o se excluyen; no se convierten silenciosamente
   en invariantes.
6. No se amplía la primera vertical sin modificar `DEV-001`, `API-001`, QA y trazabilidad.

## Flujo de trabajo

- `main` permanece estable;
- los cambios se realizan en ramas cortas;
- cada PR incluye alcance, riesgos, pruebas y documentación afectada;
- los escenarios P0 implementados quedan cubiertos antes del merge;
- la Fase 3 se cierra únicamente cuando el recorrido completo puede ejecutarse por API.
