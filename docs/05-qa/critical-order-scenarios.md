# Escenarios críticos de QA — primera vertical

## P0

### Pedido

1. Crear pedido válido congela snapshots y registra auditoría.
2. Dos solicitudes con misma clave y contenido devuelven el mismo pedido.
3. Misma clave con contenido distinto produce conflicto.
4. Solo el comercio de la sucursal puede aceptar.
5. Aceptación concurrente produce una única transición.
6. Preparar o marcar listo desde estado incorrecto falla.

### Entrega

7. Dos asignaciones concurrentes dejan una sola activa.
8. Repartidor no asignado no puede retirar ni entregar.
9. Retiro antes de `READY` falla.
10. Retiro duplicado no transfiere custodia dos veces.
11. PIN incorrecto no completa entrega.
12. Entrega duplicada no duplica cobro, evento ni transición.
13. Entrega por actor ajeno es denegada sin filtrar existencia.
14. Efectivo distinto del esperado no confirma entrega ni pago.
15. La entrega final libera exactamente una asignación activa.

### Infraestructura y seguridad

16. Mutación y Outbox se confirman o revierten juntas.
17. Reprocesar evento no duplica efectos.
18. Versión desactualizada devuelve conflicto y no cambia estado.
19. Pedido o entrega ajenos no filtran datos.
20. Toda intervención conserva actor, estado anterior/nuevo y correlación cuando aplica.
21. El PIN no aparece en auditoría, Outbox ni respuestas.
22. Dos confirmaciones financieras concurrentes con la misma clave producen un solo resultado.
23. Solo `OPERATIONS` puede consultar la auditoría por Pedido.
24. La auditoría de un Pedido no devuelve entradas de agregados ajenos.
25. La sanitización de metadata elimina PIN, hashes, tokens, secretos y credenciales incluso si
    aparecen anidados.
26. Un Pedido inexistente en auditoría devuelve `404 ORDER_NOT_FOUND` sin filtrar información.
27. El recorrido HTTP completo termina con Pedido `COMPLETED`, Entrega `DELIVERED`, Payment
    `CONFIRMED` y cero asignaciones activas.

## Cobertura HTTP implementada hasta Fase 3.7

### Comercio y asignación

- creación de pedido idempotente;
- alcance por cliente/sucursal;
- `ACCEPTED → PREPARING → READY` con versión esperada;
- asignación manual protegida por restricciones de base;
- una entrega activa por repartidor y una asignación activa por entrega.

### Retiro, traslado y llegada

- repartidor distinto recibe `404 DELIVERY_NOT_FOUND`;
- `start-pickup` exige Pedido `READY`;
- retiro duplicado no duplica evidencia;
- `StartDelivery` falla antes de `PICKED_UP`;
- `ReportCourierArrival` falla antes de `ON_THE_WAY`;
- retries de traslado/llegada devuelven `changed: false` sin duplicar auditoría ni Outbox;
- la asignación permanece activa hasta `ARRIVED`.

### Entrega final y dinero

- PIN incorrecto revierte Delivery, Payment, Order y CourierAssignment;
- efectivo incorrecto revierte los cuatro ciclos coordinados;
- repartidor ajeno no puede finalizar una entrega;
- `Idempotency-Key` equivalente recupera el mismo resultado;
- misma clave con contenido distinto devuelve `IDEMPOTENCY_KEY_CONFLICT`;
- dos solicitudes concurrentes con la misma clave producen un único resultado financiero;
- cambio real persiste exactamente una vez:
  - `DeliveryCompleted`;
  - `PaymentConfirmed`;
  - `OrderFulfilled`;
  - `CourierAssignmentReleased`;
  - sus cuatro entradas de auditoría;
- el PIN no queda en la auditoría;
- la asignación queda inactiva al finalizar la entrega;
- `CompleteOrder` falla antes de Delivery `DELIVERED`, Payment `CONFIRMED` y liberación;
- `CompleteOrder` repetido no duplica `OrderCompleted`.

### Auditoría y puerta E2E

- `GET /operations/orders/{orderId}/audit` exige `OPERATIONS`;
- cliente, comercio y repartidor reciben `403 ROLE_FORBIDDEN`;
- el rol de operaciones se vuelve a validar contra persistencia dentro del servicio;
- la consulta se restringe a `Order`, `Delivery` y `Payment` vinculados al Pedido solicitado;
- no existe búsqueda global de `AuditLog` en la primera vertical;
- la metadata de salida se sanitiza recursivamente por claves sensibles;
- una sonda sintética comprueba que PIN, request hash y token no se filtran;
- el E2E recorre creación, comercio, asignación, retiro, custodia, traslado, llegada, entrega,
  pago, fulfillment, cierre y auditoría;
- el E2E verifica las acciones críticas de auditoría de los cuatro actores;
- el estado final persistido queda en `COMPLETED / DELIVERED / CONFIRMED` y sin asignación activa.

## Invariante atómica de entrega final

La confirmación normal del piloto se considera exitosa únicamente si se confirman juntos:

```text
Delivery = DELIVERED
Payment = CONFIRMED
Order = FULFILLED
CourierAssignment = INACTIVE
Audit = append-only
Outbox = eventos canónicos de los ciclos afectados
IdempotencyRecord = COMPLETED
```

Cualquier error de PIN, efectivo, autorización, versión, unicidad o concurrencia debe dejar todos
los componentes en su estado previo.

## Invariante de cierre de Fase 3

La primera vertical API se considera técnicamente cerrada solo si una ejecución reproducible
confirma:

```text
Order = COMPLETED
Delivery = DELIVERED
Payment = CONFIRMED
Active CourierAssignment = 0
Audit scope = Order + Delivery + Payment del Pedido
Sensitive audit metadata = no expuesta
```

La prueba E2E no sustituye las pruebas unitarias, de integración, permisos, concurrencia ni
idempotencia; actúa como puerta adicional de coherencia sistémica.

## Niveles

- unitarias: transiciones, políticas y permisos;
- integración: persistencia, transacciones, concurrencia, Outbox y asignación;
- API: DTO, errores, alcance e idempotencia;
- E2E: recorrido completo y fallos críticos.

## Regla de merge

Un P0 implementado no puede quedar sin prueba reproducible. Todo defecto P0 descubierto debe
producir una prueba de regresión antes de cerrar el issue.
