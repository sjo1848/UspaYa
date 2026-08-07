# API-001 — Contrato REST de la primera vertical

## Estado

Fase 3 en curso. La primera vertical ya puede recorrer por HTTP desde creación hasta `COMPLETED`.
Permanece pendiente la consulta autorizada de auditoría y la puerta final de cierre de Fase 3.

## Base URL

```text
/api/v1
```

## Cabeceras transversales

### `x-correlation-id`

- opcional en la solicitud;
- entre 8 y 128 caracteres seguros;
- si falta o no es aceptable, la API genera uno;
- se devuelve en la respuesta;
- aparece en todos los errores estables.

### `x-dev-actor-id`

Identidad sembrada solo para `development` y `test` cuando `DEV_IDENTITY_ENABLED=true`.
El proceso falla cerrado si el bypass intenta habilitarse en otro entorno.

| Rol         | ID                                     |
| ----------- | -------------------------------------- |
| Cliente     | `11111111-1111-4111-8111-111111111111` |
| Comercio    | `22222222-2222-4222-8222-222222222222` |
| Operaciones | `33333333-3333-4333-8333-333333333333` |
| Repartidor  | `44444444-4444-4444-8444-444444444444` |

No constituye autenticación productiva.

### `Idempotency-Key`

Obligatoria en:

- `POST /orders`;
- `POST /courier/deliveries/{deliveryId}/confirm-delivery`.

Debe tener entre 8 y 128 caracteres y representar una sola intención lógica. Misma clave y mismo
contenido recuperan el resultado almacenado. Misma clave con contenido distinto produce
`409 IDEMPOTENCY_KEY_CONFLICT`.

### `expectedVersion`

Las mutaciones sobre agregados existentes reciben la versión observada por el cliente. Una
versión desactualizada produce `409 VERSION_CONFLICT`. Las transiciones ya aplicadas pueden
responder `changed: false` sin duplicar auditoría ni Outbox.

## Error estable

```json
{
  "code": "ORDER_NOT_FOUND",
  "message": "The requested order was not found.",
  "correlationId": "..."
}
```

`details` es opcional. No debe incluir PIN, hashes, credenciales ni datos personales innecesarios.

## Endpoints base

### `GET /health`

Público. Confirma que el proceso HTTP responde.

### `GET /actors/me`

Devuelve identidad, roles y alcances del actor de desarrollo actual.

### `GET /catalog/branches/{branchId}/products`

Roles: `CUSTOMER`, `MERCHANT_OPERATOR`, `OPERATIONS`.

Devuelve únicamente comercio, sucursal y productos activos.

## Pedido — cliente

### `POST /orders`

Rol: `CUSTOMER`.

Requiere `Idempotency-Key`.

El cliente genera UUID v4 para pedido, entrega, pago e ítems. El PIN se recibe solo en escritura y
se persiste como derivación `scrypt` con sal.

```json
{
  "orderId": "uuid-v4",
  "deliveryId": "uuid-v4",
  "paymentId": "uuid-v4",
  "branchId": "uuid-v4",
  "deliveryPin": "4826",
  "items": [
    {
      "itemId": "uuid-v4",
      "productId": "uuid-v4",
      "quantity": 1
    }
  ]
}
```

### `GET /orders/{orderId}`

Roles: `CUSTOMER`, `MERCHANT_OPERATOR`, `OPERATIONS`, `COURIER`.

Alcance:

- cliente: sus pedidos;
- comercio: pedidos de su sucursal;
- operaciones: pedidos operativos;
- repartidor: pedido asociado a su entrega activa.

Un pedido inexistente y uno fuera de alcance producen la misma respuesta `404 ORDER_NOT_FOUND`.

## Comercio

Todos requieren `MERCHANT_OPERATOR` y vuelven a validar la sucursal dentro de la transacción.

Cuerpo común:

```json
{
  "expectedVersion": 2
}
```

### `POST /orders/{orderId}/accept`

`PENDING_MERCHANT → ACCEPTED`.

Auditoría `AcceptOrder`; Outbox `OrderAccepted`.

### `POST /orders/{orderId}/start-preparation`

`ACCEPTED → PREPARING`.

Auditoría `StartOrderPreparation`; Outbox `OrderPreparationStarted`.

### `POST /orders/{orderId}/ready`

`PREPARING → READY`.

Auditoría `MarkOrderReady`; Outbox `OrderReady`.

## Operaciones — asignación

### `GET /operations/deliveries/unassigned`

Rol: `OPERATIONS`.

Lista entregas `PENDING_ASSIGNMENT` cuyo Pedido está `READY`. No expone PIN ni derivación.

### `POST /operations/deliveries/{deliveryId}/assign`

Rol: `OPERATIONS`.

```json
{
  "courierId": "uuid-v4",
  "expectedVersion": 1
}
```

Condiciones:

- Pedido `READY`;
- repartidor activo con rol `COURIER`;
- una sola asignación activa por Entrega;
- una sola entrega activa por repartidor;
- versión vigente.

Cambio real: `PENDING_ASSIGNMENT → ASSIGNED`, auditoría `AssignCourier` y Outbox
`CourierAssigned`.

## Repartidor — retiro

Todos los endpoints se limitan a la asignación activa del actor. Una entrega ajena y una
inexistente producen `404 DELIVERY_NOT_FOUND`.

### `GET /courier/deliveries/active`

Rol: `COURIER`.

Devuelve proyección mínima de la entrega activa: identificadores, estado, versión, importes,
estado del Pedido, sucursal y momento de asignación. No devuelve material de verificación.

### `POST /courier/deliveries/{deliveryId}/start-pickup`

Rol: `COURIER`.

```json
{
  "expectedVersion": 2
}
```

Requiere Pedido `READY` y Entrega `ASSIGNED` para un cambio nuevo.

Cambio real: `ASSIGNED → PICKUP_IN_PROGRESS`, auditoría `StartPickup`, Outbox `PickupStarted`.

### `POST /courier/deliveries/{deliveryId}/confirm-pickup`

Rol: `COURIER`.

```json
{
  "expectedVersion": 3,
  "merchantResponsible": "Responsable comercio",
  "packageCount": 2
}
```

Requiere Pedido `READY`, Entrega `PICKUP_IN_PROGRESS`, responsable no vacío y
`packageCount >= 1`.

Cambio real: `PICKUP_IN_PROGRESS → PICKED_UP`, auditoría `ConfirmPickup`, Outbox
`OrderPickedUp`. Responsable y cantidad de bultos quedan como evidencia estructurada.

## Repartidor — traslado y llegada

### `POST /courier/deliveries/{deliveryId}/start-delivery`

Rol: `COURIER`.

```json
{
  "expectedVersion": 4
}
```

Cambio real: `PICKED_UP → ON_THE_WAY`, auditoría `StartDelivery`, Outbox `DeliveryStarted`.

### `POST /courier/deliveries/{deliveryId}/arrive`

Rol: `COURIER`.

```json
{
  "expectedVersion": 5
}
```

Cambio real: `ON_THE_WAY → ARRIVED`, auditoría `ReportCourierArrival`, Outbox
`CourierArrived`. La asignación sigue activa hasta confirmar la entrega final.

## Repartidor — entrega final, efectivo y fulfillment

### `POST /courier/deliveries/{deliveryId}/confirm-delivery`

Rol: `COURIER`.

Requiere `Idempotency-Key` porque la operación afecta custodia y dinero.

```json
{
  "expectedVersion": 6,
  "pin": "4826",
  "receiver": "Cliente receptor",
  "cashReceivedCents": 250000
}
```

Condiciones:

- el actor es el repartidor activamente asignado;
- Entrega `ARRIVED`;
- PIN válido;
- receptor no vacío;
- efectivo recibido exactamente igual al esperado;
- Payment del piloto todavía `PENDING`;
- versiones vigentes.

El PIN solo participa en verificación. No se devuelve, no se guarda en auditoría y no se publica
en Outbox.

Un cambio real confirma atómicamente, en una única transacción serializable:

1. `Delivery: ARRIVED → DELIVERED` mediante `ConfirmDelivery → DeliveryCompleted`;
2. `Payment: PENDING → CONFIRMED` mediante `ConfirmPayment → PaymentConfirmed`;
3. `Order: READY → FULFILLED` mediante `MarkOrderFulfilled → OrderFulfilled`;
4. liberación de `CourierAssignment` mediante `CourierAssignmentReleased`;
5. auditoría append-only de los cuatro efectos;
6. registro del resultado idempotente.

Si falla PIN, efectivo, versión, autorización o concurrencia, ninguno de esos efectos queda
confirmado parcialmente.

Respuesta:

```json
{
  "deliveryId": "uuid-v4",
  "orderId": "uuid-v4",
  "paymentId": "uuid-v4",
  "deliveryStatus": "DELIVERED",
  "paymentStatus": "CONFIRMED",
  "orderStatus": "FULFILLED",
  "deliveryVersion": 7,
  "paymentVersion": 2,
  "orderVersion": 6,
  "changed": true
}
```

Dos solicitudes concurrentes equivalentes con la misma clave producen un solo resultado
financiero y una sola evidencia.

El fallback de PIN no forma parte de DEV-001.

## Operaciones — cierre del Pedido

### `POST /operations/orders/{orderId}/complete`

Rol: `OPERATIONS` durante el piloto asistido.

```json
{
  "expectedVersion": 6
}
```

Solo puede ejecutar `FULFILLED → COMPLETED` cuando:

- Delivery está `DELIVERED`;
- Payment está `CONFIRMED`;
- no existe `CourierAssignment` activa;
- la versión del Pedido está vigente.

Cambio real: auditoría `CompleteOrder`, Outbox `OrderCompleted`.

La automatización futura por `SYSTEM` queda diferida; no se introduce en esta fase.

## OpenAPI

Interfaz local:

```text
http://localhost:3000/api/v1/docs
```

Los ejemplos son sintéticos. OpenAPI no debe incluir secretos, PIN reales, teléfonos,
direcciones privadas ni credenciales.

## Pendiente dentro de Fase 3

- consulta autorizada de auditoría;
- prueba de recorrido completo desde creación hasta `COMPLETED` como puerta final;
- revisión de permisos/error envelopes de la vertical completa;
- cierre de la issue general de Fase 3.
