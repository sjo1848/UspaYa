# UspaYa

Plataforma local de pedidos y logística de última milla para Uspallata, Mendoza.

## Estado

**READY FOR TECHNICAL FOUNDATION**

La arquitectura y la primera vertical técnica están definidas. El proyecto todavía está:

- **NOT READY FOR CLOSED PILOT**
- **NOT READY FOR PUBLIC RELEASE**

La implementación inicial validará estados, permisos, idempotencia, concurrencia y custodia con datos ficticios. No implica lanzamiento ni aprobación de decisiones comerciales pendientes.

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
- Jest, Vitest y Playwright según nivel.

## Documentación de implementación

- [`GATE-001`](docs/00-governance/GATE-001-technical-readiness.md)
- [`MVP-001`](docs/01-product/MVP-001-pilot-scope.md)
- [`Order lifecycle`](docs/02-domain/order-lifecycle.md)
- [`Order transition matrix`](docs/02-domain/order-transition-matrix.md)
- [`ADR-001`](docs/03-architecture/ADR-001-modular-monolith.md)
- [`ADR-002`](docs/03-architecture/ADR-002-outbox.md)
- [`ADR-003`](docs/03-architecture/ADR-003-technology-stack.md)
- [`DEV-001`](docs/04-application/DEV-001-first-vertical.md)
- [`QA critical scenarios`](docs/05-qa/critical-order-scenarios.md)

## Principios

1. Pedido, Pago, Entrega e Incidencia mantienen ciclos independientes.
2. Las mutaciones críticas son autorizadas, auditadas, idempotentes y seguras ante concurrencia.
3. Una notificación fallida no revierte una transición confirmada.
4. Las decisiones provisionales se configuran o se excluyen; no se convierten silenciosamente en invariantes.
5. No se amplía la primera vertical sin modificar `DEV-001` y justificar el cambio.

## Flujo de trabajo

- `main` permanece estable.
- Los cambios se realizan en ramas cortas.
- Cada PR debe incluir alcance, riesgos, pruebas y documentación afectada.
- Los escenarios P0 implementados deben quedar cubiertos antes del merge.
