from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} not found in {path}')
    p.write_text(text.replace(old, new, 1))


api = 'docs/04-application/API-001-rest-contract.md'
replace_once(
    api,
    """Fase 4.2 añade el read-model mínimo de descubrimiento de sucursales necesario para que el cliente
pueda iniciar el flujo sin conocer UUID internos. Fase 4.3 añade la bandeja abierta del comercio y
endurece los alcances para conservar el rol que originó cada scope. Ninguno de estos read-models
cambia los estados ni las reglas del dominio.""",
    """Fase 4.2 añade el read-model mínimo de descubrimiento de sucursales necesario para que el cliente
pueda iniciar el flujo sin conocer UUID internos. Fase 4.3 añade la bandeja abierta del comercio y
endurece los alcances para conservar el rol que originó cada scope. Fase 4.4 añade únicamente los
read-models operativos faltantes para elegir un repartidor disponible y localizar Pedidos entregados
pendientes de cierre. Ninguno de estos read-models cambia los estados ni las reglas del dominio.""",
    'API status',
)
replace_once(
    api,
    """### `POST /operations/deliveries/{deliveryId}/assign`
""",
    """### `GET /operations/couriers/available`

Rol: `OPERATIONS`.

Read-model mínimo de candidatos para la asignación manual del piloto. Devuelve únicamente usuarios
activos con rol `COURIER` y sin ninguna asignación activa. La proyección contiene solo
`courierId` y `displayName`, con orden estable por nombre e ID.

Esta lista es orientativa: no modela cobertura, vehículo, capacidad, scoring ni distancia y no
constituye una reserva. `AssignCourier` vuelve a validar dentro de la transacción que el actor siga
activo, conserve el rol y no tenga otra entrega activa.

### `POST /operations/deliveries/{deliveryId}/assign`
""",
    'available couriers endpoint',
)
replace_once(
    api,
    """## Operaciones — cierre del Pedido

### `POST /operations/orders/{orderId}/complete`
""",
    """## Operaciones — cierre del Pedido

### `GET /operations/orders/pending-completion`

Rol: `OPERATIONS`.

Read-model mínimo de Pedidos que cumplen simultáneamente:

- `Order = FULFILLED`;
- `Payment = CONFIRMED`;
- `Delivery = DELIVERED`;
- cero `CourierAssignment` activas.

La proyección contiene `orderId`, versión, sucursal, total, moneda, estados de Pago/Entrega y
timestamps. El orden es determinista por `updatedAt` e ID. Esta lista es orientativa y no sustituye
la validación transaccional de `CompleteOrder`.

### `POST /operations/orders/{orderId}/complete`
""",
    'pending completion endpoint',
)

web = 'docs/04-application/WEB-001-frontend-contract.md'
replace_once(
    web,
    """Fase 4 en curso. Fase 4.1, fundación UI 4.1.1 y el flujo cliente 4.2 están cerrados. Fase 4.3
materializa la bandeja y las transiciones mínimas del comercio sobre la vertical ya cerrada por
API-001. Este documento gobierna la frontera web y no redefine estados, permisos ni reglas de
negocio.""",
    """Fase 4 en curso. Fase 4.1, fundación UI 4.1.1, flujo cliente 4.2 y superficie comercial 4.3
están cerrados. Fase 4.4 materializa la superficie mínima de Operaciones sobre la vertical ya
cerrada por API-001. Este documento gobierna la frontera web y no redefine estados, permisos ni
reglas de negocio.""",
    'WEB status',
)
replace_once(
    web,
    """## Conectividad transversal
""",
    """## Fase 4.4 — flujo Operaciones

La superficie se monta únicamente cuando `/actors/me` confirma rol `OPERATIONS`.

Recorrido implementado:

```text
entregas listas sin asignar + repartidores disponibles
→ asignación manual
→ entrega se procesa por el repartidor
→ Pedidos FULFILLED pendientes de cierre
→ CompleteOrder
→ auditoría por Pedido
```

### Asignación manual

- `GET /operations/deliveries/unassigned` continúa siendo la cola de entregas `READY` sin
  asignación;
- `GET /operations/couriers/available` aporta únicamente candidatos básicos: usuario activo, rol
  `COURIER` y sin asignación activa;
- la UI no presenta esa lista como elegibilidad definitiva: `AssignCourier` vuelve a validar todas
  las condiciones dentro de la transacción;
- la mutación usa `expectedVersion` de la Entrega vigente;
- no se implementan scoring, cobertura, vehículo, distancia, reasignación ni auto-ofertas.

### Resultado incierto de asignación

Si la red falla durante la asignación, la UI no asume éxito ni rechazo. Consulta
`GET /orders/{orderId}` y decide únicamente con el estado autoritativo:

- `Delivery = ASSIGNED` con el repartidor seleccionado → confirmado;
- `Delivery = PENDING_ASSIGNMENT` sin repartidor → puede ofrecer un nuevo intento consciente;
- cualquier otro estado o repartidor → refresco obligatorio, sin retry ciego.

### Cierre asistido

- `GET /operations/orders/pending-completion` lista únicamente Pedidos `FULFILLED` con Payment
  `CONFIRMED`, Delivery `DELIVERED` y sin asignación activa;
- `CompleteOrder` sigue siendo autoridad y vuelve a validar esas condiciones dentro de la
  transacción;
- la UI muestra Pedido, Pago y Entrega como ciclos separados;
- la mutación usa `expectedVersion`.

Ante fallo de red durante el cierre, se consulta el Pedido:

- `COMPLETED` → cierre confirmado;
- `FULFILLED` → el estado sigue siendo potencialmente reintentable después de revisar;
- otro estado → refresco obligatorio.

### Auditoría

La misma superficie puede consultar `GET /operations/orders/{orderId}/audit`. Es solo lectura,
acotada al Pedido y sus agregados vinculados; la sanitización de metadata sensible permanece en el
backend. La interfaz traduce acciones conocidas a etiquetas comprensibles y no expone metadata
sensible ni convierte la auditoría en un buscador global.

Fase 4.4 no incorpora reasignación, fallback de PIN, cambio de modalidad, reembolsos, incidencias,
reintentos de entrega, devoluciones, optimización automática ni autenticación productiva.

## Conectividad transversal
""",
    'WEB operations section',
)
replace_once(
    web,
    """### Fase 4.3

- bandeja abierta del comercio sin UUID hardcodeado;
- scopes de sucursal ligados al rol de origen;
- detalle autoritativo reutilizado;
- aceptación, inicio de preparación y READY;
- READY permanece visible en la bandeja;
- recuperación ante `VERSION_CONFLICT` y fallo de red;
- estados visibles de Pedido, Pago y Entrega separados;
- regresión de aislamiento para cuenta multirol.

## Fuera de alcance actual

- superficies funcionales de operaciones y repartidor;""",
    """### Fase 4.3

- bandeja abierta del comercio sin UUID hardcodeado;
- scopes de sucursal ligados al rol de origen;
- detalle autoritativo reutilizado;
- aceptación, inicio de preparación y READY;
- READY permanece visible en la bandeja;
- recuperación ante `VERSION_CONFLICT` y fallo de red;
- estados visibles de Pedido, Pago y Entrega separados;
- regresión de aislamiento para cuenta multirol.

### Fase 4.4

- cola de entregas listas sin asignar;
- candidatos básicos de repartidor sin PII innecesaria;
- asignación manual con revalidación transaccional;
- recuperación autoritativa de asignación incierta;
- cola estricta de Pedidos entregados pendientes de cierre;
- `CompleteOrder` con recuperación de resultado incierto;
- auditoría por Pedido desde la interfaz;
- un único `ApiClient` compartido para todas las superficies.

## Fuera de alcance actual

- superficie funcional del repartidor;""",
    'WEB completed scope',
)

qa = 'docs/05-qa/critical-order-scenarios.md'
replace_once(
    qa,
    """57. Los estados y errores visibles usan copy comprensible y no exponen enums internos como mensaje
    principal.

## Cobertura HTTP implementada hasta Fase 3.7""",
    """57. Los estados y errores visibles usan copy comprensible y no exponen enums internos como mensaje
    principal.

### Frontend Operaciones — Fase 4.4

58. Solo `OPERATIONS` puede consultar repartidores disponibles y Pedidos pendientes de cierre.
59. La lista de repartidores incluye únicamente usuarios activos con rol `COURIER` y sin asignación
    activa.
60. Usuario inactivo, actor sin rol `COURIER` y repartidor ocupado quedan fuera del read-model.
61. La proyección de repartidores no expone email ni otros datos personales innecesarios.
62. La cola de cierre incluye solo `FULFILLED / CONFIRMED / DELIVERED` sin asignación activa.
63. Pago no confirmado, entrega no realizada, asignación activa y Pedido no `FULFILLED` quedan fuera.
64. Ambos read-models tienen orden estable y son orientativos; las mutaciones revalidan condiciones.
65. La asignación usa `expectedVersion`; cambios de disponibilidad fuerzan refresco.
66. Un fallo de red durante asignación consulta el Pedido antes de habilitar otro intento.
67. Solo `ASSIGNED` con el repartidor elegido confirma recuperación de la asignación.
68. La finalización usa `expectedVersion` y vuelve a validar Pago, Entrega y asignación.
69. Un cierre incierto se confirma solo al observar `COMPLETED`; `FULFILLED` permite revisar un
    reintento consciente y cualquier otro estado exige refresco.
70. La auditoría desde UI sigue restringida a `OPERATIONS`, es solo lectura y no expone metadata
    sensible.
71. La UI muestra Pedido, Pago y Entrega por separado y evita enums técnicos como copy principal.
72. Reasignación, fallback PIN, incidencias, reembolsos y optimización permanecen fuera de 4.4.

## Cobertura HTTP implementada hasta Fase 3.7""",
    'QA operations P0',
)
replace_once(
    qa,
    """La integración PostgreSQL usa un Pedido creado por `SubmitOrder`, respetando que el estado
`PENDING_MERCHANT` ya se observa con versión `2`; las transiciones posteriores validan versiones
`3`, `4` y `5` hasta `READY`.

## Invariante atómica de entrega final""",
    """La integración PostgreSQL usa un Pedido creado por `SubmitOrder`, respetando que el estado
`PENDING_MERCHANT` ya se observa con versión `2`; las transiciones posteriores validan versiones
`3`, `4` y `5` hasta `READY`.

## Cobertura Fase 4.4 — Operaciones

La superficie Operaciones añade pruebas reproducibles para:

- autorización negativa de los nuevos read-models;
- repartidor disponible limitado a actor activo + rol `COURIER` + cero asignaciones activas;
- exclusión de PII innecesaria y orden estable;
- cola de cierre estricta `FULFILLED / CONFIRMED / DELIVERED / sin asignación`;
- exclusión de combinaciones que todavía no son cerrables;
- rutas tipadas de asignación, cierre y auditoría en el `ApiClient` compartido;
- decisiones puras de recuperación para asignación y cierre inciertos;
- UI con ciclos separados y acciones operativas acotadas al primer vertical.

Los read-models no reemplazan las validaciones transaccionales de `AssignCourier` ni
`CompleteOrder`.

## Invariante atómica de entrega final""",
    'QA operations coverage',
)
replace_once(
    qa,
    """- integración: persistencia, transacciones, concurrencia, Outbox, catálogo, bandeja de comercio y
  asignación;
- API: DTO, errores, roles, scopes por rol, alcance e idempotencia;
- frontend: cliente HTTP, estados de red, intención de pedido y flujos cliente/comercio;""",
    """- integración: persistencia, transacciones, concurrencia, Outbox, catálogo, bandejas de comercio y
  Operaciones, disponibilidad básica y condiciones de cierre;
- API: DTO, errores, roles, scopes por rol, alcance e idempotencia;
- frontend: cliente HTTP, estados de red, intención de pedido y flujos cliente/comercio/Operaciones;""",
    'QA levels',
)

readme = 'README.md'
replace_once(
    readme,
    """La Fase 3 de API está cerrada. Fase 4.1 y 4.1.1 establecieron la frontera web y la fundación UI;
Fase 4.2 cerró el flujo funcional del cliente y Fase 4.3 materializa la superficie mínima del
comercio. El núcleo de dominio, persistencia transaccional, auditoría, idempotencia, Outbox, worker
y el recorrido HTTP principal permanecen cubiertos por CI.""",
    """La Fase 3 de API está cerrada. Fase 4.1 y 4.1.1 establecieron la frontera web y la fundación UI;
Fase 4.2 cerró el flujo funcional del cliente, Fase 4.3 cerró la superficie mínima del comercio y
Fase 4.4 implementa la superficie operativa mínima. El núcleo de dominio, persistencia
transaccional, auditoría, idempotencia, Outbox, worker y el recorrido HTTP principal permanecen
cubiertos por CI.""",
    'README status',
)
replace_once(
    readme,
    """Todavía faltan las superficies funcionales de operaciones y repartidor, además de autenticación
productiva y validación local con actores reales.""",
    """Todavía falta la superficie funcional del repartidor, además de autenticación productiva y
validación local con actores reales.""",
    'README remaining surfaces',
)
replace_once(
    readme,
    """### Frontend — Fases 4.1 a 4.3""",
    """### Frontend — Fases 4.1 a 4.4""",
    'README frontend heading',
)
replace_once(
    readme,
    """- estados visibles en español y ciclos Pedido/Pago/Entrega separados.""",
    """- estados visibles en español y ciclos Pedido/Pago/Entrega separados;
- operaciones: cola de entregas listas sin asignar y repartidores disponibles básicos;
- operaciones: asignación manual con recuperación autoritativa ante resultado incierto;
- operaciones: cola estricta de Pedidos entregados pendientes de cierre y `CompleteOrder`;
- operaciones: auditoría de solo lectura por Pedido con acciones traducidas para la interfaz.""",
    'README frontend operations bullets',
)
replace_once(
    readme,
    """GET  /api/v1/operations/deliveries/unassigned
POST /api/v1/operations/deliveries/{deliveryId}/assign""",
    """GET  /api/v1/operations/deliveries/unassigned
GET  /api/v1/operations/couriers/available
POST /api/v1/operations/deliveries/{deliveryId}/assign""",
    'README courier endpoint',
)
replace_once(
    readme,
    """POST /api/v1/operations/orders/{orderId}/complete
GET  /api/v1/operations/orders/{orderId}/audit""",
    """GET  /api/v1/operations/orders/pending-completion
POST /api/v1/operations/orders/{orderId}/complete
GET  /api/v1/operations/orders/{orderId}/audit""",
    'README completion endpoint',
)
replace_once(
    readme,
    """La puerta de Fase 3 mantiene el E2E que recorre cliente, comercio, operaciones y repartidor desde
creación hasta `COMPLETED`. Fase 4 añade regresiones de frontend y read-models. Fase 4.3 cubre de
forma explícita aislamiento horizontal, cuenta multirol, bandeja hasta `READY`, versión optimista y
recuperación visible.""",
    """La puerta de Fase 3 mantiene el E2E que recorre cliente, comercio, operaciones y repartidor desde
creación hasta `COMPLETED`. Fase 4 añade regresiones de frontend y read-models. Fase 4.3 cubre
aislamiento horizontal y recuperación comercial; Fase 4.4 añade disponibilidad básica de
repartidores, condiciones estrictas de cierre y recuperación autoritativa de mutaciones operativas.""",
    'README QA',
)
replace_once(
    readme,
    """Después de cerrar y fusionar Fase 4.3, el siguiente incremento funcional es **Fase 4.4 operaciones**:
cola operativa, asignación manual desde interfaz, localización de pedidos `FULFILLED` pendientes de
cierre y auditoría acotada por Pedido, reutilizando las mutaciones ya probadas por Fase 3.""",
    """Después de cerrar y fusionar Fase 4.4, el siguiente incremento funcional es **Fase 4.5 repartidor**:
materializar en la web móvil la entrega activa, retiro, custodia, traslado, llegada y confirmación
final, reutilizando los contratos ya probados por Fase 3.""",
    'README next',
)
