# ADR-004 — Arquitectura hexagonal pragmática y CQRS ligero

**Estado:** ACCEPTED

## Contexto

UspaYa mantiene un monolito modular (ADR-001) con reglas de negocio críticas alrededor de Pedido, Pago, Entrega, asignación, idempotencia, concurrencia, auditoría y Outbox. La implementación actual ya separa `domain`, `application`, `http` e `infrastructure`, pero varios casos de uso de `application` dependen directamente de Prisma y coordinan infraestructura transaccional desde la propia capa de aplicación.

La intención de este ADR no es introducir Clean Architecture ceremonial ni reescribir la Fase 3 ya validada, sino proteger el núcleo transaccional y hacer explícita la dirección de dependencias.

## Decisión

Mantener el **monolito modular** y aplicar **arquitectura hexagonal pragmática** en comandos/mutaciones críticas, complementada con **CQRS ligero**.

Dirección de dependencias objetivo:

```text
adapters -> application -> domain
```

Reglas:

- `domain` no depende de NestJS, Prisma, HTTP ni infraestructura;
- los casos de uso críticos de `application` dependen de puertos propios y no de implementaciones concretas;
- Prisma, HTTP, Outbox y servicios externos son adapters;
- cuando una operación deba coordinar múltiples agregados y evidencias en una misma transacción, se utiliza una frontera transaccional/Unit of Work explícita;
- los adapters de persistencia pueden seguir utilizando Prisma y PostgreSQL;
- los tests con PostgreSQL real continúan siendo obligatorios para concurrencia, locks, índices, transacciones e idempotencia;
- no se crea una interfaz por cada clase ni una abstracción sin una frontera real;
- las queries/read-models simples pueden usar una vía directa y optimizada, siempre que no contengan reglas de negocio críticas ni permitan mutaciones;
- las mutaciones críticas no acceden a Prisma desde controllers;
- las reglas de dependencia deben quedar verificadas automáticamente en CI.

## CQRS ligero

### Command side

Para operaciones que cambian dinero, estado, custodia, asignaciones o evidencia:

```text
HTTP adapter
    -> application use case
        -> ports
            <- Prisma/infra adapters
        -> domain
```

Se priorizan invariantes, atomicidad, idempotencia y concurrencia.

### Query side

Para lecturas y proyecciones simples:

```text
HTTP -> query/read adapter -> Prisma projection
```

No se exige pasar por agregados ni repositorios genéricos cuando eso no aporta protección real.

## Unit of Work

Una sola acción puede involucrar, por ejemplo:

- Order;
- Payment;
- Delivery;
- CourierAssignment;
- AuditLog;
- OutboxEvent;
- IdempotencyRecord.

La arquitectura no debe fragmentar una garantía transaccional por pureza estructural. El puerto transaccional debe permitir que el adapter Prisma confirme o revierta estos efectos como una unidad.

## Estrategia de adopción

No se realizará un refactor masivo.

1. `SubmitOrder` será el primer caso patrón.
2. Debe conservar exactamente su contrato HTTP y comportamiento observable.
3. Una vez validado el patrón, se aplica progresivamente a otras mutaciones cuando sean modificadas por trabajo funcional.
4. Las queries existentes no se migran por defecto.

## Controles de arquitectura

Como mínimo deben rechazarse dependencias equivalentes a:

- `domain -> Prisma`;
- `domain -> NestJS`;
- `application -> http/controller`;
- adapters inbound que persistan mutaciones críticas directamente sin caso de uso.

Se permiten:

- `application -> domain`;
- `application -> ports`;
- `adapter -> application`;
- `adapter -> domain` solo cuando sea necesario para mapping/rehidratación y sin invertir la dirección de control.

## Deuda de transición conocida

La primera adopción desacopla `SubmitOrder` de Prisma, pero conserva temporalmente una dependencia preexistente desde `ordering/application` hacia `delivery/domain` para construir la Entrega dentro del mismo flujo transaccional. Esa dependencia no satisface todavía la regla de ADR-001 que prohíbe entrar en internals de otro módulo.

No se corrige en este mismo refactor para evitar convertir el hardening en una reescritura transversal. Antes de extender el patrón hexagonal a más casos de uso se debe definir una frontera pública de orquestación entre Ordering y Delivery —o elevar el workflow a una capa de aplicación que no pertenezca a ninguno de los dos módulos— conservando la atomicidad PostgreSQL existente.

También existe temporalmente una duplicación de la utilidad de idempotencia: `SubmitOrder` utiliza la versión de aplicación mientras `ConfirmDelivery` conserva la exportada desde `@uspaya/database`. La convergencia se hará de forma progresiva y sin alterar códigos HTTP ni semántica de hashing.

Estas dos brechas son explícitas y no deben interpretarse como arquitectura objetivo.

## Consecuencias

### Positivas

- reglas críticas menos acopladas a Prisma;
- casos de uso más fáciles de razonar y probar;
- posibilidad de adapters alternativos sin contaminar el dominio;
- límites explícitos para futuros módulos o servicios externos;
- preservación de las garantías PostgreSQL que ya son parte del QA.

### Costos

- más contratos y wiring en operaciones críticas;
- necesidad de diseñar correctamente el contexto transaccional;
- riesgo de abstracciones ceremoniales si se aplica indiscriminadamente.

## Alternativas rechazadas

- mantener dependencia directa de Prisma en todos los casos de uso;
- convertir todo el backend a Clean Architecture rígida;
- repositorio genérico universal;
- CQRS completo con buses, stores separados o event sourcing;
- microservicios para obtener aislamiento arquitectónico.

## Revisión

Revisar este ADR si la cantidad de puertos/adapters comienza a superar el valor que aportan, si aparece un segundo motor de persistencia real, si módulos requieren despliegue independiente o si las garantías transaccionales cambian de forma sustancial.
