# UspaYa

Plataforma local de pedidos y logística de última milla para Uspallata, Mendoza.

## Estado

**PHASE 3 — API VERTICAL FUNCTIONALLY COMPLETE, FINAL AUDIT GATE PENDING**

El núcleo de dominio, persistencia transaccional, auditoría, idempotencia, Outbox, worker y el
recorrido HTTP principal ya están implementados. La vertical puede avanzar desde creación del
pedido hasta `COMPLETED` con datos de desarrollo.

El proyecto continúa:

- **NOT READY FOR CLOSED PILOT**
- **NOT READY FOR PUBLIC RELEASE**

Todavía falta la consulta operativa de auditoría y la puerta final de cierre de Fase 3. El
frontend funcional y la autenticación productiva pertenecen a etapas posteriores.

## Primera vertical

```text
SubmitOrder
→ PENDING_MERCHANT
→ ACCEPTED
→ PREPARING
→ READY
→ ASSIGNED
→ PICKUP_IN_PROGRESS
→ PICKED_UP
→ ON_THE_WAY
→ ARRIVED
→ DELIVERED / Payment CONFIRMED / Order FULFILLED
→ COMPLETED
```

Condiciones iniciales:

- un comercio y una sucursal por pedido;
- `USPAYA_DELIVERY`;
- efectivo contra entrega;
- asignación manual;
- una entrega activa por repartidor;
- PIN normal de entrega, sin fallback en DEV-001;
- actores y datos ficticios sembrados.

## Capacidades disponibles

- API versionada bajo `/api/v1`;
- healthcheck y OpenAPI;
- identidad segura de desarrollo;
- autorización por rol y alcance;
- catálogo activo por sucursal;
- creación idempotente de pedidos;
- consulta protegida de pedidos;
- comercio: aceptar, preparar y marcar `READY`;
- operaciones: cola de entregas y asignación manual;
- repartidor: retiro, custodia, traslado, llegada y entrega final;
- confirmación atómica de Delivery, Payment y Order al entregar;
- liberación transaccional de la asignación activa;
- cierre posterior del Pedido por operaciones durante el piloto asistido;
- control optimista de versión;
- auditoría append-only y Outbox;
- PostgreSQL, migraciones y seeds reproducibles;
- pruebas unitarias, integración HTTP y smoke tests en CI.

## Endpoints principales

```text
GET  /api/v1/health
GET  /api/v1/actors/me
GET  /api/v1/catalog/branches/{branchId}/products
POST /api/v1/orders
GET  /api/v1/orders/{orderId}

POST /api/v1/orders/{orderId}/accept
POST /api/v1/orders/{orderId}/start-preparation
POST /api/v1/orders/{orderId}/ready

GET  /api/v1/operations/deliveries/unassigned
POST /api/v1/operations/deliveries/{deliveryId}/assign

GET  /api/v1/courier/deliveries/active
POST /api/v1/courier/deliveries/{deliveryId}/start-pickup
POST /api/v1/courier/deliveries/{deliveryId}/confirm-pickup
POST /api/v1/courier/deliveries/{deliveryId}/start-delivery
POST /api/v1/courier/deliveries/{deliveryId}/arrive
POST /api/v1/courier/deliveries/{deliveryId}/confirm-delivery

POST /api/v1/operations/orders/{orderId}/complete
```

El contrato detallado vive en [`API-001`](docs/04-application/API-001-rest-contract.md).

## Entrega final y dinero

`confirm-delivery` exige `Idempotency-Key`, repartidor asignado, estado `ARRIVED`, PIN válido,
receptor y efectivo exacto. Un cambio real confirma en una sola transacción serializable:

- `Delivery → DELIVERED`;
- `Payment → CONFIRMED`;
- `Order → FULFILLED`;
- liberación de `CourierAssignment`;
- auditoría y Outbox de cada ciclo;
- resultado idempotente.

PIN incorrecto, efectivo incorrecto, conflicto de versión o concurrencia revierten todos los
efectos. El PIN no se devuelve ni se registra en auditoría.

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
- `node:test` para el núcleo actual.

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

La aplicación falla cerrada si el bypass se intenta habilitar fuera de un entorno expresamente
permitido. No existe autenticación productiva todavía.

## Calidad

```bash
pnpm check
pnpm test:integration
```

`pnpm check` ejecuta Prisma Client, formato, lint, typecheck, pruebas unitarias y builds. La
integración requiere PostgreSQL migrado y sembrado.

## Principios

1. Pedido, Pago, Entrega e Incidencia mantienen ciclos independientes.
2. Las mutaciones críticas son autorizadas, auditadas y seguras ante concurrencia.
3. La idempotencia se aplica cuando un reintento puede duplicar efectos.
4. Una notificación fallida no revierte una transición confirmada.
5. Las decisiones provisionales no se convierten silenciosamente en invariantes.
6. La Fase 3 se cierra únicamente con el recorrido completo, auditoría autorizada y P0 verdes.
