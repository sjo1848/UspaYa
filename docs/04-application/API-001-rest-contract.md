# API-001 — Contrato REST de la primera vertical

## Estado

Fase 3 completada. La primera vertical puede recorrer por HTTP desde creación hasta `COMPLETED`,
con consulta autorizada y sanitizada de auditoría por Pedido.

Fase 4.2 añade el read-model mínimo de descubrimiento de sucursales necesario para que el cliente
pueda iniciar el flujo sin conocer UUID internos. Fase 4.3 añade la bandeja abierta del comercio y
endurece los alcances para conservar el rol que originó cada scope. Ninguno de estos read-models
cambia los estados ni las reglas del dominio.

El avance de Fase 4 no autoriza todavía el piloto real ni la autenticación productiva.

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

La proyección de identidad conserva en cada scope el `role` que originó ese alcance, además de los
identificadores opcionales de comercio o sucursal. Una cuenta multirol no puede combinar un rol con
un `branchId` procedente de otra asignación para ampliar acceso horizontal.

### `Idempotency-Key`

Obligatoria en:

- `POST /orders`;
- `POST /courier/deliveries/{deliveryId}/confirm-delivery`.

Debe tener entre 8 y 128 caracteres y representar una sola intención lógica. Misma clave y mismo
contenido recuperan el resultado almacenado. Misma clave con contenido distinto produce
`409 IDEMPOTENCY_KEY_CONFLICT`.

Cuando una intención contiene un secreto de baja entropía como el PIN de entrega, el registro de
idempotencia no persiste un SHA-256 directo del PIN ni del payload que lo contiene. Se separa el
fingerprint no sensible del verificador secreto y el PIN se comprueba mediante una derivación
`scrypt` con sal. Esto conserva la detección de reutilización de clave con un PIN distinto sin crear
un oráculo barato de fuerza bruta.

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

Devuelve identidad, roles y alcances del actor de desarrollo actual. Cada alcance incluye el rol que
lo originó y, cuando corresponda, `merchantId` o `branchId`.

### `GET /catalog/branches`

Roles: `CUSTOMER`, `MERCHANT_OPERATOR`, `OPERATIONS`.

Read-model CQRS simple para descubrimiento. Devuelve únicamente comercios y sucursales activos que
tengan al menos un producto activo. La proyección mínima contiene `merchantId`, `merchantName`,
`branchId` y `branchName`, con orden estable. No expone UUID ocultos adicionales ni datos de
productos.

### `GET /catalog/branches/{branchId}/products`

Roles: `CUSTOMER`, `MERCHANT_OPERATOR`, `OPERATIONS`.

Devuelve únicamente comercio, sucursal y productos activos.

## Pedido — cliente

### `POST /orders`

Rol: `CUSTOMER`.

Requiere `Idempotency-Key`.

El cliente genera UUID v4 para pedido, entrega, pago e ítems. El PIN se recibe solo en escritura y
se persiste como derivación `scrypt` con sal. El fingerprint de idempotencia tampoco conserva una
derivación SHA-256 barata del PIN.

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
- comercio: pedidos de una sucursal incluida en un scope originado por `MERCHANT_OPERATOR`;
- operaciones: pedidos operativos;
- repartidor: pedido asociado a su entrega activa.

Un pedido inexistente y uno fuera de alcance producen la misma respuesta `404 ORDER_NOT_FOUND`.
Para comercio no basta con poseer el rol y cualquier `branchId`: el alcance debe provenir de la
asignación `MERCHANT_OPERATOR` correspondiente.

## Comercio

### `GET /merchant/orders`

Rol: `MERCHANT_OPERATOR`.

Read-model de bandeja abierta para la primera vertical. Devuelve únicamente pedidos pertenecientes
a sucursales incluidas en scopes originados por `MERCHANT_OPERATOR` y cuyos estados sean:

- `PENDING_MERCHANT`;
- `ACCEPTED`;
- `PREPARING`;
- `READY`.

`READY` permanece en la bandeja para no ocultar pedidos listos y conservar el contexto logístico
exigido por UX-005. Los estados terminales y los pedidos de otras sucursales quedan fuera.

Orden estable: `createdAt ASC`, luego `id ASC`.

Proyección mínima:

```json
{
  "orderId": "uuid-v4",
  "branch": {
    "id": "uuid-v4",
    "name": "Sucursal piloto"
  },
  "status": "PENDING_MERCHANT",
  "version": 2,
  "totalCents": 250000,
  "currency": "ARS",
  "paymentStatus": "PENDING",
  "deliveryStatus": "PENDING_ASSIGNMENT",
  "createdAt": "2026-08-07T20:00:00.000Z",
  "updatedAt": "2026-08-07T20:00:00.000Z"
}
```

La bandeja no duplica ítems ni el detalle completo. Para abrir un Pedido se reutiliza
`GET /orders/{orderId}`.

Las mutaciones siguientes requieren `MERCHANT_OPERATOR` y vuelven a validar el `RoleAssignment` de
la sucursal dentro de la transacción.

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

El PIN solo participa en verificación. No se devuelve, no se guarda en auditoría, no se publica
en Outbox y no queda expuesto como hash SHA-256 de baja entropía en idempotencia.

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

## Operaciones — auditoría por Pedido

### `GET /operations/orders/{orderId}/audit`

Rol: `OPERATIONS`.

La autorización se verifica en la frontera HTTP y nuevamente contra el rol persistido dentro del
servicio de aplicación.

La consulta se limita al Pedido solicitado y a sus agregados vinculados `Order`, `Delivery` y
`Payment`. No existe búsqueda global de `AuditLog` en el MVP.

Cada entrada expone únicamente:

- acción;
- tipo e ID del agregado;
- versión del agregado;
- actorId;
- metadata sanitizada;
- fecha.

La sanitización recursiva elimina claves sensibles relacionadas con PIN, hashes, secretos,
passwords, tokens, credenciales, idempotencia, request hashes y API keys. El PIN de entrega no
puede aparecer en la respuesta.

Clientes, comercio y repartidor reciben `403 ROLE_FORBIDDEN`. Un Pedido inexistente produce
`404 ORDER_NOT_FOUND`.

## OpenAPI

Interfaz local:

```text
http://localhost:3000/api/v1/docs
```

Los ejemplos son sintéticos. OpenAPI no debe incluir secretos, PIN reales, teléfonos,
direcciones privadas ni credenciales.

## Puerta de cierre de Fase 3

La vertical se considera cerrada únicamente cuando la prueba E2E reproduce por HTTP:

```text
crear Pedido
→ aceptar
→ preparar
→ READY
→ asignar repartidor
→ iniciar retiro
→ confirmar custodia
→ iniciar traslado
→ ARRIVED
→ confirmar entrega + Payment + fulfillment + liberar asignación
→ completar Pedido
→ consultar auditoría autorizada
```

La prueba final verifica además:

- `Order = COMPLETED`;
- `Delivery = DELIVERED`;
- `Payment = CONFIRMED`;
- cero asignaciones activas;
- acciones críticas presentes en auditoría;
- metadata sensible eliminada;
- permisos negativos para cliente, comercio y repartidor;
- error estable para Pedido inexistente.

Fase 3 no incluye autenticación productiva, búsqueda global de auditoría, exportaciones analíticas
ni ampliaciones funcionales del MVP.
