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
28. El fingerprint de idempotencia de una operación con PIN no persiste un hash SHA-256 barato del
    secreto.
29. Reutilizar la misma `Idempotency-Key` con un PIN distinto produce conflicto y no reutiliza el
    resultado previo.

### Frontend cliente — Fase 4.2

30. Descubrimiento muestra solo sucursales activas con al menos un producto activo.
31. Sucursal o comercio inactivos no aparecen en el read-model de catálogo.
32. El carrito contiene productos de una sola sucursal.
33. Cambiar de sucursal vacía el carrito antes de cargar el nuevo catálogo.
34. Cantidades fuera de `1..99` no forman una intención válida.
35. Doble toque durante `SubmitOrder` no genera una segunda intención.
36. Una intención conserva `orderId`, `deliveryId`, `paymentId`, IDs de ítems e
    `Idempotency-Key` durante un retry lógico.
37. Un fallo de red después del envío queda como resultado incierto, no como rechazo.
38. Recuperación consulta `GET /orders/{orderId}` antes de ofrecer retry.
39. `404 ORDER_NOT_FOUND` autoritativo habilita retry de la misma intención sin regenerar IDs.
40. Producto desactivado antes de confirmar provoca rechazo autoritativo y refresh del catálogo.
41. El PIN no se persiste en `localStorage`, `sessionStorage`, IndexedDB ni logs.
42. El seguimiento representa por separado estados de Pedido, Pago y Entrega sin inventar estados.
43. Los errores HTTP conservan `code` y `correlationId`; los fallos de red usan una clase distinta.

### Frontend comercio — Fase 4.3

44. Solo `MERCHANT_OPERATOR` puede consultar `GET /merchant/orders`.
45. La bandeja muestra únicamente pedidos de sucursales incluidas en scopes originados por
    `MERCHANT_OPERATOR`.
46. Una cuenta multirol no puede usar un `branchId` proveniente de otro rol para ampliar acceso a
    la bandeja ni a `GET /orders/{orderId}`.
47. Pedidos terminales y pedidos de otra sucursal no aparecen en la bandeja.
48. La bandeja mantiene orden determinista por antigüedad e ID.
49. `PENDING_MERCHANT`, `ACCEPTED`, `PREPARING` y `READY` permanecen visibles en la primera
    vertical; `READY` no desaparece al quedar sin nueva acción comercial.
50. Cada fila representa por separado estado de Pedido, Pago y Entrega.
51. La UI solo ofrece aceptar desde `PENDING_MERCHANT`, iniciar preparación desde `ACCEPTED` y
    marcar listo desde `PREPARING`.
52. Cada transición envía la `expectedVersion` autoritativa observada.
53. Doble toque durante una mutación del comercio no inicia una segunda solicitud paralela.
54. `VERSION_CONFLICT` obliga a volver a consultar el Pedido antes de permitir otra acción.
55. Un fallo de red durante una mutación queda como resultado incierto y dispara lectura
    autoritativa antes de ofrecer una nueva acción.
56. Si la recuperación también falla por red, la mutación sigue incierta y no se reintenta a
    ciegas.
57. Los estados y errores visibles usan copy comprensible y no exponen enums internos como mensaje
    principal.

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
- mismo contenido no sensible con PIN distinto también produce conflicto;
- el registro de idempotencia con PIN usa fingerprint protegido `scrypt-v1`, no un SHA-256 barato
  del secreto;
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

## Cobertura Fase 4.2 — cliente

La primera superficie cliente añade pruebas reproducibles para:

- rutas tipadas de descubrimiento y catálogo;
- encoding de `branchId` en URL;
- headers de actor, correlación e idempotencia sin filtrarlos a la URL;
- errores HTTP estables frente a errores de red;
- creación inmutable de intención con UUIDs e `Idempotency-Key` estables;
- validación de PIN y cantidades antes del envío;
- read-model PostgreSQL que filtra sucursal, comercio y catálogo inactivos;
- fingerprint protegido del PIN y conflicto ante PIN distinto con la misma clave.

La recuperación de resultado incierto se valida además por contrato de estado: no se crea una nueva
intención hasta que la API haya confirmado `ORDER_NOT_FOUND` para el `orderId` original.

## Cobertura Fase 4.3 — comercio

La superficie comercio añade pruebas reproducibles para:

- ruta tipada `GET /merchant/orders`;
- autorización negativa para cliente, operaciones y repartidor;
- filtrado por sucursal comercial y exclusión de pedidos terminales;
- orden estable por antigüedad;
- proyección separada de `paymentStatus` y `deliveryStatus`;
- persistencia visible del Pedido en bandeja durante `PENDING_MERCHANT → ACCEPTED → PREPARING →
READY`;
- regresión multirol donde un scope de otro rol no amplía acceso comercial;
- `GET /orders/{orderId}` ocultando con `404` el Pedido de una sucursal no autorizada;
- cliente HTTP tipado para bandeja y transiciones con `expectedVersion`;
- recuperación de conflicto y de resultado incierto antes de una nueva mutación.

La integración PostgreSQL usa un Pedido creado por `SubmitOrder`, respetando que el estado
`PENDING_MERCHANT` ya se observa con versión `2`; las transiciones posteriores validan versiones
`3`, `4` y `5` hasta `READY`.

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

- unitarias: transiciones, políticas, helpers e intención frontend;
- integración: persistencia, transacciones, concurrencia, Outbox, catálogo, bandeja de comercio y
  asignación;
- API: DTO, errores, roles, scopes por rol, alcance e idempotencia;
- frontend: cliente HTTP, estados de red, intención de pedido y flujos cliente/comercio;
- E2E: recorrido completo y fallos críticos.

## Regla de merge

Un P0 implementado no puede quedar sin prueba reproducible. Todo defecto P0 descubierto debe
producir una prueba de regresión antes de cerrar el issue.
