# UspaYa

Plataforma local de pedidos y logística de última milla para Uspallata, Mendoza.

## Estado

**PHASE 4 — FRONTEND VERTICAL IN PROGRESS**

La Fase 3 de API está cerrada. Fase 4.1 y 4.1.1 establecieron la frontera web y la fundación UI;
Fase 4.2 cerró el flujo funcional del cliente y Fase 4.3 implementa la superficie mínima del
comercio. El núcleo de dominio, persistencia transaccional, auditoría, idempotencia, Outbox, worker
y el recorrido HTTP principal permanecen cubiertos por CI.

El proyecto continúa:

- **NOT READY FOR CLOSED PILOT**
- **NOT READY FOR PUBLIC RELEASE**

Todavía faltan las superficies funcionales de operaciones y repartidor, además de autenticación
productiva y validación local con actores reales. La recuperación durable del PIN tras recargar o
cerrar la aplicación sigue siendo una brecha explícita previa al piloto.

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
→ auditoría operativa por Pedido
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

### Backend

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
- auditoría por Pedido restringida a `OPERATIONS` y con metadata sanitizada;
- control optimista de versión;
- auditoría append-only y Outbox;
- PostgreSQL, migraciones y seeds reproducibles;
- pruebas unitarias, integración HTTP, E2E de la vertical y smoke tests en CI;
- primer caso patrón de arquitectura hexagonal pragmática: `SubmitOrder` depende de un port de
  persistencia y el adapter Prisma conserva la transacción serializable.

### Frontend — Fases 4.1, 4.1.1, 4.2 y 4.3

- shell funcional Vue 3 + Vite;
- cliente HTTP tipado basado en `fetch` nativo;
- distinción entre rechazo HTTP autoritativo y fallo de red;
- transporte de `x-dev-actor-id`, `Idempotency-Key` y `x-correlation-id`;
- preservación de `correlationId` en errores;
- helper inmutable para conservar una clave idempotente durante el retry de una misma intención;
- selector de los cuatro actores sembrados solo en development/test;
- comprobación real mediante `/health` y `/actors/me`;
- proxy Vite `/api` hacia la API local, sin CORS permisivo de desarrollo;
- estado visible de conectividad y actualización;
- Tailwind CSS v4 mediante `@tailwindcss/vite`;
- shadcn-vue con primitives iniciales Button, Input, Label, Card, Select, Badge, Alert, Separator y
  Skeleton;
- aliases `@/*` y convención `components/ui`;
- tokens CSS como base del tema;
- tipografía base mediante fuentes del sistema, sin dependencia de Google Fonts;
- aprobación explícita y limitada de `vue-demi` en la política `allowBuilds` de pnpm;
- smoke proof del shell usando primitives shadcn-vue;
- sin router, Pinia ni Axios mientras no exista una necesidad demostrada;
- descubrimiento de sucursales y catálogo funcional sin UUID hardcodeados;
- carrito local de una sola sucursal con cantidades `1..99`;
- intención inmutable con UUIDs + `Idempotency-Key` estable;
- PIN de 4–6 dígitos solo en memoria, nunca en storage persistente;
- recuperación de resultado incierto mediante `GET /orders/{orderId}` antes de reintentar;
- seguimiento separado de Order, Payment y Delivery;
- bandeja comercial sin UUID hardcodeados y limitada a scopes `MERCHANT_OPERATOR`;
- detalle comercial con Pedido/Pago/Entrega separados;
- aceptar, iniciar preparación y marcar `READY` con `expectedVersion`;
- recuperación de conflicto de versión y resultado de red incierto antes de repetir una acción;
- `READY` permanece visible sin mutación comercial adicional en esta fase.

## Endpoints principales

```text
GET  /api/v1/health
GET  /api/v1/actors/me
GET  /api/v1/catalog/branches
GET  /api/v1/catalog/branches/{branchId}/products
POST /api/v1/orders
GET  /api/v1/orders/{orderId}
GET  /api/v1/merchant/orders

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
GET  /api/v1/operations/orders/{orderId}/audit
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

## Auditoría operativa

`GET /operations/orders/{orderId}/audit` está reservado a `OPERATIONS` y vuelve a comprobar el rol
persistido dentro del servicio. La consulta solo incluye el Pedido solicitado y sus agregados
`Order`, `Delivery` y `Payment`.

La metadata se sanitiza recursivamente para eliminar PIN, hashes, tokens, secretos, credenciales,
claves idempotentes, request hashes y API keys. El MVP no expone un buscador global de auditoría.

## Frontera web

En desarrollo, Vite atiende la aplicación en `http://localhost:5173` y reenvía `/api` a
`http://127.0.0.1:3000`. El navegador no necesita una política CORS permisiva para trabajar contra
la API local.

El shell usa los actores sembrados únicamente como herramienta de desarrollo. Cambiar el actor
vuelve a consultar `/actors/me`; los permisos y alcances efectivos siguen siendo decisión del
backend.

Un fallo de red se representa como resultado incierto de conectividad. No se transforma en éxito
ni en rechazo de negocio. Las mutaciones que requieran idempotencia conservarán la misma intención
y su `Idempotency-Key` durante reintentos lógicos.

## Arquitectura aceptada

- monolito modular;
- DDD en el núcleo del dominio;
- arquitectura hexagonal pragmática para comandos/mutaciones críticas;
- CQRS ligero: read-models simples pueden usar proyecciones directas sin capas ceremoniales;
- ports/adapters y frontera transaccional cuando protegen invariantes reales;
- monorepo TypeScript con pnpm workspaces;
- API NestJS;
- web Vue 3 + Vite + TypeScript + Tailwind CSS v4 + shadcn-vue, preparada como PWA;
- PostgreSQL;
- Prisma ORM y migraciones;
- Outbox transaccional mínimo y worker sin broker externo;
- OpenAPI;
- Docker Compose;
- GitHub Actions;
- `node:test` para el núcleo backend y Vitest para el frontend actual.

La adopción hexagonal es progresiva. `SubmitOrder` es el primer caso patrón; no se reescribe la
Fase 3 en masa. ADR-004 mantiene como deuda de transición conocida el acceso temporal de
`ordering/application` a `delivery/domain`.

## Documentación de implementación

- [`GATE-001`](docs/00-governance/GATE-001-technical-readiness.md)
- [`MVP-001`](docs/01-product/MVP-001-pilot-scope.md)
- [`Order lifecycle`](docs/02-domain/order-lifecycle.md)
- [`Order transition matrix`](docs/02-domain/order-transition-matrix.md)
- [`ADR-001`](docs/03-architecture/ADR-001-modular-monolith.md)
- [`ADR-002`](docs/03-architecture/ADR-002-outbox.md)
- [`ADR-003`](docs/03-architecture/ADR-003-technology-stack.md)
- [`ADR-004`](docs/03-architecture/ADR-004-pragmatic-hexagonal-cqrs.md)
- [`ADR-005`](docs/03-architecture/ADR-005-web-ui-stack.md)
- [`DEV-001`](docs/04-application/DEV-001-first-vertical.md)
- [`API-001`](docs/04-application/API-001-rest-contract.md)
- [`WEB-001`](docs/04-application/WEB-001-frontend-contract.md)
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
permitido. El frontend oculta el selector fuera de development/test, pero esa ocultación no es un
control de seguridad: el backend sigue fallando cerrado. No existe autenticación productiva
todavía.

## Calidad

```bash
pnpm check
pnpm test:integration
```

`pnpm check` ejecuta Prisma Client, formato, lint, typecheck, pruebas unitarias y builds. La
integración requiere PostgreSQL migrado y sembrado.

La puerta de Fase 3 mantiene el E2E que recorre cliente, comercio, operaciones y repartidor desde
creación hasta `COMPLETED`. La Fase 4 agrega tests del cliente HTTP, errores de red, headers,
idempotencia y componentes de interfaz antes de materializar cada superficie funcional.

## Siguiente incremento

Después de cerrar y fusionar Fase 4.3, el siguiente incremento funcional es **Fase 4.4 operaciones**:
cola operativa, asignación manual, cierre y auditoría acotada desde la interfaz, reutilizando los
contratos ya probados en Fase 3.

## Principios

1. Pedido, Pago, Entrega e Incidencia mantienen ciclos independientes.
2. Las mutaciones críticas son autorizadas, auditadas y seguras ante concurrencia.
3. La idempotencia se aplica cuando un reintento puede duplicar efectos.
4. Una notificación fallida no revierte una transición confirmada.
5. Las decisiones provisionales no se convierten silenciosamente en invariantes.
6. El frontend no inventa permisos ni estados: representa la respuesta autoritativa de la API.
7. Un fallo de conectividad no equivale a una decisión de negocio.
8. La complejidad arquitectónica y de UI debe ser proporcional al riesgo y a una necesidad real.
