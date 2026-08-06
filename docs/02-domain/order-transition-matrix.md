# UspaYa — Matriz de transiciones del pedido

## Convenciones

Cada transición debe validar:

- estado origen y versión esperada;
- actor autorizado;
- precondiciones;
- datos obligatorios;
- efectos de dominio;
- eventos y notificaciones;
- compensación o recuperación ante error.

## Matriz MVP

| Origen | Destino | Actor | Precondiciones | Efectos obligatorios |
|---|---|---|---|---|
| `DRAFT` | `PENDING_CONFIRMATION` | Cliente | Carrito no vacío, comercio habilitado | Recalcular precios, zona, horario y disponibilidad |
| `PENDING_CONFIRMATION` | `DRAFT` | Cliente | Revisión no confirmada | Conservar carrito y liberar cotización temporal |
| `PENDING_CONFIRMATION` | `PENDING_PAYMENT` | Cliente/Sistema | Pago previo requerido | Congelar cotización y crear intento de pago idempotente |
| `PENDING_CONFIRMATION` | `PENDING_MERCHANT` | Cliente/Sistema | Pago contra entrega o no bloqueante | Crear instantánea del pedido y notificar comercio |
| `PENDING_PAYMENT` | `PENDING_MERCHANT` | Sistema/Operador | Pago confirmado o validado | Asociar referencia y enviar al comercio |
| `PENDING_PAYMENT` | `CANCELLED` | Cliente/Sistema | Pago cancelado o vencido | Cancelar intento y liberar reservas |
| `PENDING_MERCHANT` | `ACCEPTED` | Comercio | Productos, horario y capacidad confirmados | Registrar aceptación, ETA y responsable |
| `PENDING_MERCHANT` | `CHANGE_PROPOSED` | Comercio | Faltante, sustitución, ajuste o demora relevante | Crear versión propuesta sin aplicarla |
| `PENDING_MERCHANT` | `CANCELLED` | Comercio/Sistema | Rechazo o tiempo máximo agotado | Registrar motivo y resolver pago |
| `CHANGE_PROPOSED` | `ACCEPTED` | Cliente | Propuesta aceptada y total válido | Activar nueva versión y registrar consentimiento |
| `CHANGE_PROPOSED` | `PENDING_PAYMENT` | Cliente/Sistema | Diferencia positiva que exige pago | Crear ajuste idempotente |
| `CHANGE_PROPOSED` | `PENDING_MERCHANT` | Cliente/Comercio | Cliente solicita otra alternativa | Mantener historial y abrir nueva propuesta |
| `CHANGE_PROPOSED` | `CANCELLED` | Cliente/Sistema | Rechazo o vencimiento | Aplicar política de cancelación y devolución |
| `ACCEPTED` | `PREPARING` | Comercio | Política de pago satisfecha | Registrar inicio real de preparación |
| `ACCEPTED` | `CANCELLATION_REQUESTED` | Cliente/Comercio/Operador | Cancelación no automática | Abrir evaluación de impacto |
| `PREPARING` | `READY` | Comercio | Preparación terminada | Registrar hora, activar logística y notificar |
| `PREPARING` | `CHANGE_PROPOSED` | Comercio | Incidencia de producto | Pausar avance y solicitar decisión |
| `PREPARING` | `CANCELLATION_REQUESTED` | Cliente/Comercio/Operador | Existe motivo válido | Registrar avance, costos y responsable |
| `READY` | `DELIVERY_ASSIGNED` | Sistema/Operador/Repartidor | Modalidad UspaYa y asignación exclusiva | Reservar repartidor, tarifa y ETA |
| `READY` | `ON_THE_WAY` | Comercio | Entrega propia iniciada | Registrar responsable y salida |
| `READY` | `DELIVERED` | Comercio/Cliente | Retiro validado | Registrar receptor y evidencia |
| `DELIVERY_ASSIGNED` | `READY` | Sistema/Operador | Asignación rechazada o vencida | Liberar repartidor y reintentar |
| `DELIVERY_ASSIGNED` | `PICKED_UP` | Repartidor | Código o confirmación de retiro válidos | Transferir custodia y registrar hora |
| `PICKED_UP` | `ON_THE_WAY` | Repartidor/Sistema | Retiro confirmado | Actualizar ETA y notificar cliente |
| `ON_THE_WAY` | `DELIVERED` | Repartidor | PIN, receptor o evidencia válida | Registrar entrega y cobro según política |
| `ON_THE_WAY` | `DISPUTED` | Cliente/Repartidor/Operador | Entrega fallida o controvertida | Abrir incidencia y preservar evidencia |
| `DELIVERED` | `COMPLETED` | Sistema/Operador | Pago conciliado y sin incidencias bloqueantes | Calcular comisiones, liquidación y habilitar calificación |
| `DELIVERED` | `DISPUTED` | Cliente/Operador | Reclamo dentro del plazo | Bloquear cierre financiero cuando corresponda |
| `CANCELLATION_REQUESTED` | `CANCELLED` | Operador/Sistema | Política resuelta | Registrar cargos, devolución y responsabilidad |
| `CANCELLATION_REQUESTED` | Estado previo | Operador | Solicitud rechazada | Reanudar el flujo con auditoría |
| Cualquier estado no terminal | `FAILED` | Sistema | Error técnico no recuperado automáticamente | Persistir contexto y emitir alerta |
| `FAILED` | Estado seguro anterior | Sistema/Operador | Reconciliación satisfactoria | Reanudar sin repetir efectos |
| `DISPUTED` | `COMPLETED` | Operador | Reclamo resuelto sin anulación | Cerrar incidencia y liquidar |
| `DISPUTED` | `CANCELLED` | Operador | Operación anulada | Resolver devolución y responsabilidades |

## Reglas de autorización

### Cliente

Puede crear, confirmar, pagar, responder propuestas, solicitar cancelación, confirmar recepción y reclamar.

### Comercio

Puede aceptar, rechazar, proponer cambios, iniciar preparación, marcar listo y reportar incidencias.

### Repartidor

Puede aceptar la asignación, retirar, iniciar traslado, entregar y reportar incidencias.

### Operador

Puede intervenir en excepciones, reasignar, resolver cancelaciones, disputas, conciliaciones y recuperaciones.

## Idempotencia obligatoria

Se requiere clave idempotente para:

- confirmar pedido;
- crear o confirmar pago;
- aceptar pedido;
- aceptar propuesta;
- asignar repartidor;
- confirmar retiro;
- confirmar entrega;
- cancelar;
- reembolsar.

Una repetición con la misma clave devuelve el resultado previo. Una repetición con la misma clave y datos diferentes debe rechazarse.

## Concurrencia

Toda mutación debe validar una versión del agregado. Si la versión cambió, se rechaza con conflicto y se devuelve el estado vigente.

Casos prioritarios:

- cliente cancela mientras el comercio acepta;
- dos repartidores aceptan una entrega;
- comercio marca listo mientras hay un cambio pendiente;
- pago llega mientras el pedido vence;
- operador cancela mientras se confirma entrega.

## Efectos secundarios

Los eventos, notificaciones y analítica se publican después de confirmar la transición. Un fallo de estos efectos no debe deshacer el cambio de estado; se reintentan mediante una cola o patrón outbox.

## Estados terminales

- `COMPLETED`;
- `CANCELLED`.

`FAILED` y `DISPUTED` no son terminales permanentes.