# API-001 — Contrato REST de la primera vertical

## Estado

Draft de Fase 3. Este documento describe únicamente endpoints ya implementados o en
construcción dentro del PR de la Fase 3.

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

| Rol         | ID                                         |
| ----------- | ------------------------------------------ |
| Cliente     | `11111111-1111-4111-8111-111111111111` |
| Comercio    | `22222222-2222-4222-8222-222222222222` |
| Operaciones | `33333333-3333-4333-8333-333333333333` |
| Repartidor  | `44444444-4444-4444-8444-444444444444` |

La aplicación rechaza el arranque si el bypass se habilita fuera de entornos autorizados. No
constituye autenticación productiva.

### `Idempotency-Key`

Obligatoria para creación de pedidos. Debe representar una única intención lógica y contener
entre 8 y 128 caracteres.

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

## Endpoints implementados en el primer incremento

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

## OpenAPI

Interfaz local prevista:

```text
http://localhost:3000/api/v1/docs
```

Los ejemplos deben utilizar datos ficticios. No deben incluir secretos, PIN reales, teléfonos,
direcciones privadas ni credenciales.

## Pendiente dentro de la Fase 3

- aceptar pedido;
- iniciar preparación;
- marcar `READY`;
- listar entregas sin asignar;
- asignar repartidor;
- iniciar y confirmar retiro;
- iniciar traslado;
- marcar llegada;
- confirmar entrega;
- completar pedido;
- consulta autorizada de auditoría;
- cobertura positiva y negativa de cada transición.
