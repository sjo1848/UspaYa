# DEV-001 — Primera vertical técnica

**Estado:** READY FOR IMPLEMENTATION

## Objetivo

Demostrar de extremo a extremo estados, transacciones, permisos, idempotencia, concurrencia y custodia.

## Alcance

- `USPAYA_DELIVERY`;
- efectivo contra entrega;
- gate `NONE`;
- asignación manual;
- actores y datos de prueba;
- un comercio, una sucursal y una entrega activa.

## Recorrido

```text
SubmitOrder
→ PENDING_MERCHANT
→ AcceptOrder
→ ACCEPTED
→ StartOrderPreparation
→ PREPARING
→ MarkOrderReady
→ READY
→ AssignCourier
→ ASSIGNED
→ ConfirmPickup
→ PICKED_UP
→ StartDelivery
→ ON_THE_WAY
→ ReportCourierArrival
→ ARRIVED
→ ConfirmDelivery
→ DELIVERED / FULFILLED
→ CompleteOrder
→ COMPLETED
```

## Persistencia mínima

- User y roles;
- Merchant, Branch y Product;
- Order y snapshots;
- Payment;
- Delivery y CourierAssignment;
- IdempotencyRecord;
- AuditLog;
- OutboxEvent.

## P0 obligatorios

- doble `SubmitOrder` no duplica pedido;
- misma clave con contenido distinto falla;
- comercio ajeno no acepta;
- doble aceptación no duplica transición;
- estado o versión incorrectos producen conflicto;
- solo una asignación activa;
- actor no asignado no retira;
- no se retira antes de `READY`;
- `ConfirmPickup` y `ConfirmDelivery` son idempotentes;
- PIN incorrecto no entrega;
- acceso ajeno no filtra datos;
- reprocesar Outbox no duplica efectos;
- toda transición queda auditada.

## Fuera de alcance

- autenticación real;
- transferencias y pagos integrados;
- cambios de pedido;
- rechazo, cancelación y reembolso;
- fallback del PIN;
- cliente ausente y retornos;
- incidencias completas;
- otras modalidades;
- múltiples entregas;
- ofertas y optimización;
- GPS continuo;
- offline completo;
- notificaciones reales.

## Definición de terminado

- entorno reproducible desde README;
- migraciones y semillas desde base vacía;
- recorrido E2E completo;
- CI verde;
- P0 seleccionados verdes;
- OpenAPI actualizado;
- arquitectura modular respetada;
- sin secretos ni datos reales;
- limitaciones documentadas;
- sin alcance añadido silenciosamente.
