# Matriz formal de transiciones — primera vertical

La matriz completa vive en las fuentes de dominio. Esta versión gobierna `DEV-001`.

| Ciclo | Origen | Comando | Destino | Actor | Condiciones P0 |
|---|---|---|---|---|---|
| Pedido | — | `SubmitOrder` | `SUBMITTED` | Cliente | carrito válido, una sucursal, snapshots, idempotencia |
| Pedido | `SUBMITTED` | despacho interno | `PENDING_MERCHANT` | Sistema | persistencia y Outbox confirmados |
| Pedido | `PENDING_MERCHANT` | `AcceptOrder` | `ACCEPTED` | Comercio | sucursal autorizada, versión vigente |
| Pedido | `ACCEPTED` | `StartOrderPreparation` | `PREPARING` | Comercio | gate satisfecho, sin cancelación activa |
| Pedido | `PREPARING` | `MarkOrderReady` | `READY` | Comercio | sin cambio pendiente, versión vigente |
| Entrega | `PENDING_ASSIGNMENT` | `AssignCourier` | `ASSIGNED` | Operador | repartidor elegible, asignación exclusiva |
| Entrega | `ASSIGNED` | `StartPickup` | `PICKUP_IN_PROGRESS` | Repartidor | pedido `READY`, asignación vigente |
| Entrega | `PICKUP_IN_PROGRESS` | `ConfirmPickup` | `PICKED_UP` | Repartidor | comercio, pedido y bultos verificados |
| Entrega | `PICKED_UP` | `StartDelivery` | `ON_THE_WAY` | Repartidor | custodia vigente |
| Entrega | `ON_THE_WAY` | `ReportCourierArrival` | `ARRIVED` | Repartidor | entrega activa |
| Entrega | `ARRIVED` | `ConfirmDelivery` | `DELIVERED` | Repartidor | PIN válido, receptor y cobro registrados |
| Pedido | `READY` | `MarkOrderFulfilled` | `FULFILLED` | Sistema | `DeliveryCompleted` confirmado |
| Pedido | `FULFILLED` | `CompleteOrder` | `COMPLETED` | Sistema/Operador | sin bloqueo operativo |

## Reglas transversales

- cada mutación valida actor, alcance, estado y versión;
- los reintentos usan la misma clave idempotente;
- un conflicto devuelve el estado vigente;
- una notificación fallida no revierte la transición;
- el cambio de pedido y la cancelación compleja quedan fuera de `DEV-001`;
- no existe transición del pedido hacia `DELIVERY_ASSIGNED`, `PICKED_UP`, `ON_THE_WAY`, `DELIVERED`, `FAILED` o `DISPUTED`.
