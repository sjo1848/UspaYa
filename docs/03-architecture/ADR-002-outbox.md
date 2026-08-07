# ADR-002 — Eventos internos y Transactional Outbox

**Estado:** ACCEPTED

## Decisión

Registrar la mutación del agregado y el evento Outbox en la misma transacción. Un worker sin broker externo procesa los eventos pendientes.

## Implementación mínima

- tabla `OutboxEvent`;
- `eventId`, tipo, agregado, versión, fecha, correlación, causalidad y payload versionado;
- estado de procesamiento, intentos y próxima ejecución;
- consumidor idempotente;
- consulta de eventos pendientes y fallidos;
- prueba de reproceso sin duplicación.

## Uso inicial

- eventos del ciclo del pedido y entrega;
- notificaciones simuladas;
- proyecciones o consumidores de prueba.

La asignación manual del piloto sigue siendo explícita y síncrona. No se introduce broker.

## Reglas

- un evento no contiene secretos ni entidades completas;
- una notificación fallida no revierte negocio;
- los duplicados son esperables y los consumidores deben tolerarlos;
- el orden se garantiza solo por agregado cuando sea necesario.
