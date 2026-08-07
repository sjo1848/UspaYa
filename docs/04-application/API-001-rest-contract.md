# API-001 — Contrato REST de la primera vertical

## Estado

Fase 3 en curso. Este documento describe únicamente endpoints implementados o en construcción
dentro de la vertical aprobada.

## Base URL

```text
/api/v1
```

## Cabeceras transversales

### `x-correlation-id`

- opcional en la solicitud;
- debe contener entre 8 y 128 caracteres seguros;
- si no se acepta, la API genera uno nuevo;
- siempre se devuelve como cabecera de respuesta;
- también aparece en el cuerpo de errores.

### `x-dev-actor-id`

Identidad sembrada exclusivamente para `development` y `test` cuando
`DEV_IDENTITY_ENABLED=true`.

Actores actuales:

| Rol         | ID                                     |
| ----------- | -------------------------------------- |
| Cliente     | `11111111-1111-4111-8111-111111111111` |
| Comercio    | `22222222-2222-4222-8222-222222222222` |
| Operaciones | `33333333-3333-4333-8333-333333333333` |
| Repartidor  | `44444444-4444-4444-8444-444444444444` |

La aplicación rechaza el arranque si el bypass se habilita fuera de entornos autorizados. No
constituye autenticación productiva.

### `Idempotency-Key`

Obligatoria para creación de pedidos. Debe representar una única intención lógica y contener
entre 8 y 128 caracteres.

### `expectedVersion`

Las transiciones sobre un agregado existente reciben la versión observada por el cliente. Una
versión desactualizada produce `409 VERSION_CONFLICT`. Repetir una transición ya aplicada puede
devolver `changed: false` sin generar nueva auditoría ni un segundo evento.

## Error estable

```json
{
  "code": "ORDER_NOT_FOUND",
  "message": "The requested order was not found.",
  "correlationId": "..."
}
```

`details` es opcional y no debe contener secretos, PIN, hashes ni datos personales
innecesarios.

## Endpoints implementados

### `GET /health`

Público. Confirma que el proceso HTTP responde.

### `GET /actors/me`

Requiere actor de desarrollo. Devuelve identidad, roles y alcances del actor actual.

### `GET /catalog/branches/{branchId}/products`

Roles: `CUSTOMER`, `MERCHANT_OPERATOR`, `OPERATIONS`.

Devuelve únicamente sucursales, comercios y productos activos.

### `POST /orders`

Rol: `CUSTOMER`.

Requiere `Idempotency-Key`.

El cliente genera identificadores UUID v4 para pedido, entrega, pago e ítems. Esto permite que
un reintento conserve la misma intención incluso con conectividad deficiente.

Cuerpo inicial:

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

El PIN se recibe únicamente en escritura y se persiste como derivación `scrypt` con sal. No se
devuelve en consultas ni en OpenAPI con valores reales.

### `GET /orders/{orderId}`

Roles: `CUSTOMER`, `MERCHANT_OPERATOR`, `OPERATIONS`, `COURIER`.

Alcance:

- cliente: únicamente sus pedidos;
- comercio: únicamente pedidos de su sucursal;
- operaciones: pedidos operativos;
- repartidor: únicamente una entrega activa asignada.

Un pedido inexistente y uno fuera de alcance producen la misma respuesta `404 ORDER_NOT_FOUND`
para evitar filtración de existencia.

## Transiciones del comercio

Los tres endpoints requieren `MERCHANT_OPERATOR`. La aplicación vuelve a verificar dentro de la
transacción que el actor tenga una asignación para la sucursal propietaria del pedido. Un pedido
inexistente y uno fuera de alcance producen la misma respuesta `404 ORDER_NOT_FOUND`.

Cuerpo común:

```json
{
  "expectedVersion": 2
}
```

Respuesta común:

```json
{
  "orderId": "uuid-v4",
  "status": "ACCEPTED",
  "version": 3,
  "changed": true
}
```

### `POST /orders/{orderId}/accept`

Transición `PENDING_MERCHANT → ACCEPTED`. Produce auditoría `AcceptOrder` y evento
`OrderAccepted` cuando existe cambio real.

### `POST /orders/{orderId}/start-preparation`

Transición `ACCEPTED → PREPARING`. Produce auditoría `StartOrderPreparation` y evento
`OrderPreparationStarted`.

### `POST /orders/{orderId}/ready`

Transición `PREPARING → READY`. Produce auditoría `MarkOrderReady` y evento `OrderReady`.

Las tres mutaciones actualizan Pedido, auditoría y Outbox dentro de una transacción serializable.
Una repetición idempotente no duplica evidencia.

## Operaciones y asignación manual

Los endpoints de esta sección requieren `OPERATIONS`. El recorte de DEV-001 asigna únicamente
entregas cuyo Pedido ya está en `READY`; la preasignación anterior a `READY` no forma parte de
esta primera vertical implementada.

### `GET /operations/deliveries/unassigned`

Devuelve hasta 50 entregas en `PENDING_ASSIGNMENT` asociadas a Pedidos `READY`, ordenadas por
antigüedad. La proyección contiene identificadores, versiones, importes y sucursal; no expone PIN
ni su derivación.

### `POST /operations/deliveries/{deliveryId}/assign`

Cuerpo:

```json
{
  "courierId": "uuid-v4",
  "expectedVersion": 1
}
```

Condiciones:

- actor activo con rol `OPERATIONS`;
- Pedido asociado en `READY`;
- repartidor activo con rol `COURIER`;
- Entrega todavía asignable;
- una sola asignación activa por Entrega;
- una sola entrega activa por repartidor;
- versión esperada vigente para un cambio nuevo.

Respuesta:

```json
{
  "deliveryId": "uuid-v4",
  "orderId": "uuid-v4",
  "courierId": "uuid-v4",
  "status": "ASSIGNED",
  "version": 2,
  "changed": true
}
```

Un reintento de la misma asignación ya aplicada devuelve `changed: false` y no duplica
`CourierAssignment`, auditoría ni Outbox. Un cambio real persiste Entrega, asignación,
`AssignCourier` y `CourierAssigned` dentro de una transacción serializable.

Errores específicos:

- `404 DELIVERY_NOT_FOUND`;
- `409 DELIVERY_NOT_ASSIGNABLE`;
- `409 COURIER_NOT_AVAILABLE`;
- `409 ACTIVE_COURIER_ASSIGNMENT_CONFLICT`;
- `409 VERSION_CONFLICT`.

## Repartidor: retiro y transferencia de custodia

Los endpoints requieren `COURIER` y se limitan a la asignación activa del actor actual. Una
entrega inexistente y una entrega asignada a otro repartidor producen la misma respuesta
`404 DELIVERY_NOT_FOUND`.

### `GET /courier/deliveries/active`

Devuelve la entrega activa con identificadores, estado, versión, importes, estado del Pedido,
sucursal y momento de asignación. La proyección no expone material de verificación de entrega.

### `POST /courier/deliveries/{deliveryId}/start-pickup`

Cuerpo:

```json
{
  "expectedVersion": 2
}
```

Condiciones:

- actor activo con rol `COURIER`;
- asignación activa para ese repartidor;
- Pedido asociado todavía en `READY`;
- Entrega en `ASSIGNED` para un cambio nuevo;
- versión esperada vigente.

Un cambio real lleva la Entrega a `PICKUP_IN_PROGRESS` y persiste `StartPickup` y
`PickupStarted` dentro de la misma transacción serializable.

### `POST /courier/deliveries/{deliveryId}/confirm-pickup`

Cuerpo:

```json
{
  "expectedVersion": 3,
  "merchantResponsible": "Responsable comercio",
  "packageCount": 2
}
```

La confirmación requiere Pedido `READY`, Entrega en `PICKUP_IN_PROGRESS`, responsable no vacío
y `packageCount >= 1`. Un cambio real lleva la Entrega a `PICKED_UP`. La auditoría
`ConfirmPickup` conserva responsable y cantidad de bultos y el Outbox registra
`OrderPickedUp`. La asignación permanece activa para el tramo posterior.

Las repeticiones ya aplicadas devuelven `changed: false` sin duplicar auditoría ni Outbox.

## OpenAPI

Interfaz local:

```text
http://localhost:3000/api/v1/docs
```

Los ejemplos deben utilizar datos ficticios. No deben incluir secretos, PIN reales, teléfonos,
direcciones privadas ni credenciales.

## Pendiente dentro de la Fase 3

- iniciar traslado;
- marcar llegada;
- confirmar entrega;
- completar pedido;
- consulta autorizada de auditoría;
- cobertura positiva y negativa de cada transición pendiente.
