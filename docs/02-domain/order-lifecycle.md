# UspaYa — Ciclo de vida del pedido

## 1. Objetivo

Definir el comportamiento completo de un pedido y su relación con pagos, preparación, entrega, incidencias, cancelaciones, reembolsos, auditoría y recuperación ante fallos.

## 2. Separación de ciclos

El sistema no debe condensar toda la operación en un único estado. Se modelan por separado:

- **Pedido comercial:** intención, aceptación, preparación y cierre.
- **Pago:** autorización, confirmación, conciliación y devolución.
- **Entrega:** asignación, retiro, traslado y recepción.
- **Incidencia:** detección, investigación y resolución.

Esto permite representar situaciones reales, por ejemplo: pedido aceptado con pago pendiente, pedido entregado con efectivo aún no conciliado o pedido completado operativamente con una disputa abierta.

## 3. Actores

### Cliente

Crea y confirma pedidos, selecciona dirección, modalidad y pago, responde propuestas, solicita cancelaciones, recibe y reclama.

### Comercio

Acepta o rechaza, propone cambios, informa tiempos, prepara, marca como listo y reporta problemas.

### Repartidor

Acepta asignaciones, retira, traslada, entrega, registra cobros e informa incidencias.

### Operador

Supervisa, asigna, interviene en excepciones, resuelve cancelaciones, disputas y reembolsos.

### Sistema

Valida reglas, evita duplicados, administra temporizadores, registra auditoría, genera eventos y recupera operaciones.

## 4. Modalidades

- `CUSTOMER_PICKUP`: retiro por cliente.
- `MERCHANT_DELIVERY`: entrega propia del comercio.
- `USPAYA_DELIVERY`: entrega coordinada por UspaYa.

## 5. Estados comerciales del MVP

- `DRAFT`: carrito editable, sin obligación.
- `PENDING_CONFIRMATION`: validación final de datos y totales.
- `PENDING_PAYMENT`: pago previo requerido.
- `PENDING_MERCHANT`: comercio debe responder.
- `CHANGE_PROPOSED`: existe una modificación pendiente del cliente.
- `ACCEPTED`: compromiso comercial confirmado.
- `PREPARING`: preparación iniciada.
- `READY`: pedido preparado.
- `DELIVERY_ASSIGNED`: repartidor reservado para entrega UspaYa.
- `PICKED_UP`: custodia transferida al repartidor.
- `ON_THE_WAY`: pedido en traslado.
- `DELIVERED`: recepción física registrada.
- `COMPLETED`: operación comercial y financiera cerrada.
- `CANCELLATION_REQUESTED`: cancelación sujeta a evaluación.
- `CANCELLED`: operación anulada.
- `FAILED`: error técnico que requiere recuperación.
- `DISPUTED`: desacuerdo o reclamo abierto.

## 6. Flujo principal

```text
DRAFT
  ↓
PENDING_CONFIRMATION
  ├── PENDING_PAYMENT ──┐
  └─────────────────────┤
                        ↓
                PENDING_MERCHANT
                  ├── CHANGE_PROPOSED
                  ├── CANCELLED
                  └── ACCEPTED
                         ↓
                     PREPARING
                         ↓
                       READY
                         ↓
               DELIVERY_ASSIGNED
                         ↓
                     PICKED_UP
                         ↓
                    ON_THE_WAY
                         ↓
                     DELIVERED
                         ↓
                     COMPLETED
```

Para retiro o entrega propia se omiten los estados logísticos que no correspondan.

## 7. Reglas esenciales

- Un pedido del MVP corresponde a un solo comercio.
- Al enviarse al comercio se congela una instantánea de productos, precios, dirección, tarifa, descuentos y modalidad.
- Ningún cambio posterior se aplica sin trazabilidad y, cuando altera el total o el contenido, sin aceptación del cliente.
- No se eliminan pedidos ni eventos históricos.
- Toda transición debe indicar actor, motivo y versión esperada.
- Las notificaciones no controlan el estado; un fallo de notificación no revierte una transición válida.
- `FAILED` y `DISPUTED` requieren salida explícita; no deben convertirse en depósitos permanentes.

## 8. Cancelaciones

### Antes del envío

Libre e inmediata.

### Pendiente del comercio

Inmediata, normalmente sin penalidad.

### Aceptado o en preparación

Puede requerir evaluación y costo según avance, producto y política del comercio.

### Listo, retirado o en camino

Debe resolverse como cancelación evaluada o incidencia. Puede generar cobro parcial, total, retorno o reentrega.

Toda cancelación registra actor, motivo, etapa, responsabilidad, costo, reembolso y evidencia.

## 9. Incidencias

Tipos mínimos:

- producto no disponible;
- diferencia de precio;
- pago no confirmado;
- demora del comercio;
- falta de repartidor;
- demora logística;
- dirección incorrecta;
- cliente ausente;
- pedido dañado, incompleto o incorrecto;
- diferencia de efectivo;
- fallo técnico;
- pedido duplicado;
- riesgo de seguridad;
- avería del vehículo;
- sospecha de fraude.

Estados de incidencia:

- `OPEN`;
- `IN_REVIEW`;
- `WAITING_CUSTOMER`;
- `WAITING_MERCHANT`;
- `WAITING_COURIER`;
- `RESOLVED`;
- `CLOSED`.

## 10. Pago

El pago tiene ciclo independiente:

- `PENDING`;
- `REPORTED`;
- `PROCESSING`;
- `AUTHORIZED`;
- `CONFIRMED`;
- `FAILED`;
- `CANCELLED`;
- `PARTIALLY_REFUNDED`;
- `REFUNDED`;
- `CHARGEBACK`.

Un comprobante informado no equivale a pago confirmado. En efectivo debe registrarse quién cobró, cuánto recibió y cualquier diferencia.

## 11. Recuperación

Casos obligatorios:

- pago confirmado sin pedido creado;
- pedido duplicado por reintento;
- comercio aceptó pero la respuesta no llegó;
- repartidor retiró sin conectividad;
- notificación fallida;
- entrega registrada con pago no conciliado;
- servicio reiniciado durante una transición.

La recuperación debe ser idempotente, conservar la evidencia y reanudar desde un estado seguro sin duplicar cobros, pedidos ni entregas.

## 12. Auditoría

Cada transición registra:

- estado anterior y nuevo;
- actor y rol;
- fecha y canal;
- motivo;
- identificador de operación;
- versión del pedido;
- metadatos y evidencia relevantes.

## 13. Temporizadores

Deben ser configurables para:

- expiración del carrito;
- pago pendiente;
- respuesta del comercio;
- propuesta de cambio;
- preparación;
- asignación de repartidor;
- espera en destino;
- apertura de reclamo;
- procesamiento de reembolso.

No todo vencimiento cancela. Algunos generan recordatorio, alerta o intervención operativa.

## 14. Criterio de finalización

Un pedido pasa a `COMPLETED` cuando:

- la entrega o retiro fue validado;
- el pago está resuelto;
- no existen incidencias bloqueantes;
- se calcularon comisiones y liquidaciones;
- la auditoría está completa.