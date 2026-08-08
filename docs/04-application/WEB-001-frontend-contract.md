# WEB-001 — Contrato frontend de la primera vertical

## Estado

Fase 4 cerrada. Fases 4.1 a 4.5 materializaron Cliente, Comercio, Operaciones y Repartidor; Fase 4.6 cerró la puerta E2E de navegador/UX con Playwright/Chromium móvil. El hardening pre-piloto añade el snapshot de destino y su frontera temporal de privacidad sin redefinir estados, permisos ni reglas de negocio. Este documento gobierna la frontera web.

## Fuente de autoridad

1. decisiones aprobadas y ADR aceptadas;
2. DOM-006 para estados, comandos y eventos;
3. API-001 para contratos HTTP, errores y autorización;
4. UX-003 a UX-007 para comportamiento de interfaz y recuperación;
5. ADR-005 para stack y estrategia de UI;
6. WEB-001 para decisiones específicas de implementación frontend.

Ante una contradicción, el frontend se corrige; no se introduce una regla paralela.

## Principios

- El backend es autoritativo para identidad, roles, alcances, precios confirmados y estado de
  negocio.
- La interfaz no presenta una mutación como confirmada sin respuesta autoritativa o recuperación
  por consulta del estado.
- Un fallo de red no equivale a rechazo ni a éxito.
- `correlationId` se conserva para diagnóstico cuando la API lo devuelve.
- `VERSION_CONFLICT` obliga a refrescar antes de ofrecer una nueva mutación.
- Una intención idempotente conserva la misma `Idempotency-Key` y los mismos UUID durante sus
  reintentos lógicos.
- Una nueva intención recibe una clave y UUID nuevos.
- PIN, secretos, dirección y teléfono de entrega no se persisten en storage del navegador.
- Los estados visibles se expresan por texto; no dependen únicamente de color.
- Las acciones críticas usan controles táctiles adecuados y foco visible.
- Los scopes efectivos conservan el rol que los originó; el frontend no combina alcances de roles
  diferentes para habilitar una superficie.

## Stack UI — ADR-005

La base utiliza:

```text
Vue 3
Vite
TypeScript
Tailwind CSS v4
shadcn-vue
```

Convenciones:

- `src/components/ui/*` contiene primitives incorporados mediante shadcn-vue y tratados como código
  propio del repositorio;
- los componentes de negocio viven fuera de `components/ui`;
- Tailwind v4 se integra mediante `@tailwindcss/vite`;
- el alias `@/*` apunta a `src/*` para la aplicación; módulos puros pueden usar imports relativos
  cuando mejora su ejecución aislada en Vitest;
- tokens y variables CSS son la base del diseño;
- no se incorpora un catálogo completo de primitives por anticipado;
- no hay dependencia de fuentes remotas para la tipografía base.

Primitives iniciales: Button, Input, Label, Card, Select, Badge, Alert, Separator y Skeleton.

`Sheet`, `Dialog` y otros se agregan únicamente cuando un flujo funcional los necesite.

## Política de dependencias

El uso de shadcn-vue no relaja la política de supply chain del monorepo. Los scripts de instalación
siguen bloqueados por defecto mediante pnpm. `vue-demi` es la única excepción explícita actualmente
aprobada por su postinstall revisado.

El frontend mantiene TypeScript estricto. ADR-005 documenta la excepción localizada
`exactOptionalPropertyTypes=false` en `apps/web` por incompatibilidad transversal de props Vue /
shadcn-vue bajo TypeScript 6; el resto del monorepo conserva la regla activa.

## Cliente HTTP

Se usa `fetch` nativo mediante un único `ApiClient` tipado.

Responsabilidades:

- prefijo `/api/v1`;
- JSON request/response;
- `x-dev-actor-id` solo cuando el llamador lo solicita en development/test;
- `Idempotency-Key` cuando API-001 la exige;
- `x-correlation-id` cuando exista correlación explícita;
- error HTTP estable con status, code, message, correlationId y details;
- error de red separado de un rechazo HTTP autoritativo;
- `AbortSignal` cuando sea necesario descartar consultas obsoletas.

No se incorpora Axios mientras `fetch` cubra el contrato.

## Identidad de desarrollo

Los cuatro actores sembrados pueden seleccionarse en el shell únicamente durante development/test.
El selector es una herramienta de QA, no autenticación. Cambiar actor obliga a consultar
`/actors/me`; los permisos efectivos siguen siendo decisión del backend.

Cada alcance devuelto por la identidad efectiva incluye además el rol que lo originó. Esto evita que
una futura cuenta multirol pueda reutilizar un `branchId` perteneciente a otro rol para ampliar una
superficie comercial.

## Desarrollo local

Vite reenvía `/api` a `http://127.0.0.1:3000` para mantener mismo origen desde la perspectiva del
navegador sin habilitar CORS permisivo.

## Fase 4.2 — flujo cliente

La superficie cliente se monta únicamente cuando la identidad confirmada por `/actors/me` incluye
rol `CUSTOMER`.

Recorrido funcional:

```text
descubrir sucursal
→ cargar catálogo
→ carrito local de una sola sucursal
→ destino + contacto + PIN
→ crear intención inmutable
→ SubmitOrder
→ recuperar resultado si la red queda incierta
→ seguimiento de Order / Payment / Delivery
```

### Descubrimiento y catálogo

- `GET /catalog/branches` descubre únicamente sucursales activas con catálogo activo;
- el cliente no necesita UUID hardcodeados;
- seleccionar otra sucursal vacía el carrito;
- `GET /catalog/branches/{branchId}/products` obtiene productos activos;
- el precio mostrado es una previsualización; el servidor sigue siendo autoridad y congela los
  snapshots al crear el Pedido.

### Carrito

- una sola sucursal por intención;
- productos repetidos se consolidan;
- cantidad permitida por producto: `1..99`;
- la UI bloquea cambios cuando una intención ya está enviándose, incierta, lista para retry o
  confirmada;
- no existe store global en 4.2: el estado es local al flujo cliente.

### Intención e idempotencia

Al confirmar se crea una intención inmutable que conserva:

- `orderId`;
- `deliveryId`;
- `paymentId`;
- IDs de ítems;
- `Idempotency-Key`;
- snapshot normalizado de dirección/teléfono y opcionales de referencia/alojamiento;
- payload exacto de la intención.

Un doble toque no crea una segunda intención mientras el envío está activo. Si es necesario
reintentar la misma operación, se reutilizan exactamente la misma clave, IDs y payload. Cambiar
dirección o contacto exige una intención nueva; no se puede mutar un retry existente.

### Destino de entrega

- dirección y teléfono son obligatorios antes de habilitar SubmitOrder;
- referencia y alojamiento son opcionales;
- no se incorpora mapa, geocoding ni agenda de direcciones en este incremento;
- el snapshot forma parte de la intención inmutable y no se escribe en `localStorage`,
  `sessionStorage` ni IndexedDB;
- el seguimiento general del cliente no vuelve a exponer el snapshot desde `GET /orders/{orderId}`.

### PIN

- 4 a 6 dígitos;
- elegido por el cliente para la primera vertical;
- vive únicamente en memoria junto con la intención actual;
- no se escribe en `localStorage`, `sessionStorage`, IndexedDB ni logs;
- tras una recarga/cierre no es recuperable con el contrato actual;
- DEC-PIL-021 mantiene esta limitación como brecha a resolver antes de autorizar un piloto real.

El backend conserva el PIN mediante derivación `scrypt` con sal. El fingerprint de idempotencia
separa además el contenido no sensible del verificador del PIN, evitando persistir un SHA-256
barato de un secreto de baja entropía.

### Resultado incierto y recuperación

Si `SubmitOrder` pierde la conexión después de enviar:

```text
resultado incierto
→ NO asumir fallo
→ GET /orders/{orderId}
```

- si el Pedido existe, se adopta el estado autoritativo y la intención queda confirmada;
- si la API responde `404 ORDER_NOT_FOUND`, la misma intención pasa a `retryable` y puede reenviarse
  sin regenerar IDs ni clave;
- si la consulta vuelve a fallar por red, se conserva `uncertain`;
- un rechazo HTTP de negocio no se transforma en fallo de conectividad.

Si `SubmitOrder` rechaza un producto que dejó de estar disponible, se refresca el catálogo y se
retiran del carrito los productos que ya no están activos.

### Seguimiento

`GET /orders/{orderId}` es suficiente para la primera superficie de seguimiento. La UI representa
por separado:

- estado del Pedido;
- estado del Pago;
- estado de la Entrega.

No infiere transiciones ni crea estados propios.

## Fase 4.3 — flujo comercio

La superficie comercio se monta únicamente cuando la identidad confirmada por `/actors/me` incluye
rol `MERCHANT_OPERATOR`.

Recorrido implementado:

```text
GET /merchant/orders
→ seleccionar Pedido
→ GET /orders/{orderId}
→ PENDING_MERCHANT: aceptar
→ ACCEPTED: iniciar preparación
→ PREPARING: marcar READY
→ READY: mantener visible sin nueva acción comercial en este recorte
```

### Bandeja abierta

- `GET /merchant/orders` descubre los pedidos abiertos de las sucursales autorizadas;
- la bandeja incluye `PENDING_MERCHANT`, `ACCEPTED`, `PREPARING` y `READY`;
- `READY` no desaparece porque UX-005 requiere que el comercio siga viendo el pedido listo y su
  contexto logístico;
- cada fila muestra Pedido, Pago y Entrega por separado, además de sucursal, total y antigüedad;
- el orden es determinista, con los pedidos más antiguos primero;
- pedidos terminales y pedidos de otra sucursal no se muestran.

### Alcance por rol

Un scope de sucursal solo habilita la bandeja comercial si fue originado por
`MERCHANT_OPERATOR`. Una cuenta multirol no puede combinar el rol comercial con un `branchId`
proveniente de otro rol. `GET /orders/{orderId}` aplica la misma regla para la lectura comercial y
las mutaciones continúan revalidando el `RoleAssignment` dentro de la transacción.

### Detalle y acciones

El detalle completo no se duplica en la bandeja; se reutiliza `GET /orders/{orderId}`. La interfaz
muestra snapshots de productos, total y los ciclos de Pedido, Pago y Entrega de forma separada.

Acciones visibles:

- `PENDING_MERCHANT` → `AcceptOrder`;
- `ACCEPTED` → `StartOrderPreparation`;
- `PREPARING` → `MarkOrderReady`;
- `READY` → sin nueva mutación de comercio en Fase 4.3.

Cada comando usa la `expectedVersion` obtenida del estado autoritativo. La interfaz bloquea doble
toque mientras existe una solicitud pendiente.

### Conflicto y resultado incierto

- `VERSION_CONFLICT` no se reintenta automáticamente: se vuelve a consultar el Pedido;
- un fallo de red durante una mutación se representa como resultado incierto;
- antes de ofrecer otra acción se ejecuta `GET /orders/{orderId}`;
- si estado o versión cambiaron, se adopta ese resultado como autoritativo;
- si la lectura vuelve a fallar por red, la acción permanece incierta y no se repite;
- los errores visibles usan copy en español y conservan `correlationId` como referencia diagnóstica.

Fase 4.3 no incorpora rechazo, propuestas de cambio, cancelaciones con costo, validación manual de
transferencias, entrega propia ni incidencias completas. Esos flujos permanecen definidos en
UX-005/TRC-001 para incrementos posteriores.

## Fase 4.4 — flujo Operaciones

La superficie se monta únicamente cuando `/actors/me` confirma rol `OPERATIONS`.

Recorrido implementado:

```text
GET /operations/deliveries/unassigned
+ GET /operations/couriers/available
→ AssignCourier

GET /operations/orders/pending-completion
→ GET /orders/{orderId}
→ CompleteOrder
→ GET /operations/orders/{orderId}/audit
```

### Asignación manual

- la UI combina la cola READY sin asignar ya existente con el read-model de repartidores
  disponibles;
- la selección visible no es autoridad: `AssignCourier` vuelve a validar rol, actividad, versión y
  exclusividad dentro de la transacción;
- cada mutación usa la `expectedVersion` observada;
- doble toque queda bloqueado mientras existe una solicitud pendiente;
- conflictos de versión o disponibilidad refrescan entregas y repartidores antes de otra acción.

Si la red cae durante la asignación, la UI no asume fallo. Consulta `GET /orders/{orderId}`: una
Delivery `ASSIGNED` al repartidor elegido confirma el resultado; `PENDING_ASSIGNMENT` permite un
nuevo intento consciente; otro estado obliga a refrescar; una segunda caída mantiene la acción
incierta y no repite a ciegas.

### Cierre del Pedido

- `GET /operations/orders/pending-completion` muestra solo candidatos cuya proyección satisface
  `FULFILLED / CONFIRMED / DELIVERED` y sin asignación activa;
- `CompleteOrder` conserva la autoridad transaccional y vuelve a comprobar la puerta completa;
- un fallo de red se recupera mediante `GET /orders/{orderId}`: `COMPLETED` confirma éxito,
  `FULFILLED` permite una nueva decisión consciente y cualquier otro estado obliga a refrescar.

### Auditoría

La superficie reutiliza `GET /operations/orders/{orderId}/audit` para el Pedido seleccionado.
Muestra acción, agregado, versión, fecha y actor de forma legible. La sanitización sigue siendo
responsabilidad del backend. No se incorpora búsqueda global ni exportación.

Fase 4.4 no implementa reasignación completa, cambio de modalidad, falta de repartidor con
alternativas, fallback de PIN, incidencias/disputas, pagos/reembolsos operativos, GPS ni mapas.

## Fase 4.5 — flujo Repartidor

La superficie se monta únicamente cuando `/actors/me` confirma rol `COURIER`. No se crean nuevos
estados ni endpoints: se reutiliza la vertical API existente.

Recorrido implementado:

```text
GET /courier/deliveries/active
→ ASSIGNED: iniciar retiro
→ PICKUP_IN_PROGRESS: confirmar responsable + bultos
→ PICKED_UP: iniciar traslado
→ ON_THE_WAY: informar llegada
→ ARRIVED: confirmar PIN + receptor + efectivo exacto
→ DELIVERED / Payment CONFIRMED / Order FULFILLED
```

### Entrega activa y custodia

- `GET /courier/deliveries/active` es la fuente autoritativa y solo expone la asignación activa del
  actor;
- Pedido y Entrega se representan por separado con copy en español;
- `StartPickup`, `ConfirmPickup`, `StartDelivery` y `ReportCourierArrival` usan la
  `expectedVersion` vigente;
- confirmar retiro exige responsable del comercio y al menos un bulto;
- dirección/contacto no se muestran en `ASSIGNED` ni `PICKUP_IN_PROGRESS`;
- después de `ConfirmPickup → PICKED_UP`, la UI vuelve a consultar la entrega activa y muestra el
  snapshot de destino solo mientras el repartidor siga activamente asignado;
- doble toque queda bloqueado mientras una mutación está pendiente.

Ante pérdida de red en una transición no financiera, la interfaz vuelve a consultar la entrega
activa antes de ofrecer otro intento. Si el estado alcanzó o superó el objetivo, adopta el resultado
como confirmado; si continúa en el estado origen, permite una nueva decisión consciente; una
segunda pérdida de red conserva incertidumbre y nunca repite a ciegas.

### Entrega final e idempotencia

La pantalla de llegada exige PIN de 4 a 6 dígitos, receptor y efectivo exactamente igual al importe
esperado. La diferencia de efectivo bloquea la confirmación y no puede ser corregida por el
repartidor mediante cambio de total.

Al confirmar se crea una intención inmutable en memoria que conserva:

- `Idempotency-Key`;
- `expectedVersion`;
- PIN;
- receptor;
- efectivo recibido.

Si se pierde la respuesta de `ConfirmDelivery`, la UI conserva esa intención y ofrece
**Verificar entrega**, que reenvía exactamente la misma clave y payload. No genera una intención
nueva ni modifica datos durante la recuperación. Esto permite recuperar un resultado ya completado
aunque el backend haya liberado la asignación activa, porque el servicio resuelve primero el
registro idempotente.

El PIN y la intención final no se persisten en `localStorage`, `sessionStorage`, IndexedDB ni logs.
Tras recargar o cerrar la aplicación se pierden; la recuperación durable permanece como brecha
previa al piloto.

Fase 4.5 no incorpora disponibilidad avanzada, ofertas, navegación/mapas, reasignación, cambio de
modalidad, fallback de PIN, incidencias/disputas, devoluciones, GPS ni cola offline durable.

## Conectividad transversal

`navigator.onLine` es solo una señal visual. La disponibilidad real se comprueba contra `/health`.
Una consulta fallida preserva el último estado confirmado y no fabrica una decisión de negocio.

## Alcance completado

### Fase 4.1

- shell funcional;
- cliente HTTP;
- actor de desarrollo;
- health e identidad efectiva;
- proxy local;
- helper de intención idempotente;
- errores de red y HTTP separados.

### Fase 4.1.1

- Tailwind CSS v4;
- shadcn-vue;
- primitives iniciales;
- tokens CSS y aliases;
- tipografía del sistema sin dependencia remota.

### Fase 4.2

- descubrimiento de sucursales;
- catálogo;
- carrito de una sucursal;
- PIN solo en memoria;
- SubmitOrder idempotente;
- recuperación de resultado incierto;
- refresh por producto no disponible;
- seguimiento de Pedido, Pago y Entrega;
- tests de cliente HTTP e intención.

### Fase 4.3

- bandeja abierta del comercio sin UUID hardcodeado;
- scopes de sucursal ligados al rol de origen;
- detalle autoritativo reutilizado;
- aceptación, inicio de preparación y READY;
- READY permanece visible en la bandeja;
- recuperación ante `VERSION_CONFLICT` y fallo de red;
- estados visibles de Pedido, Pago y Entrega separados;
- regresión de aislamiento para cuenta multirol.

### Fase 4.4

- repartidores disponibles sin UUID hardcodeado ni datos personales innecesarios;
- asignación manual desde interfaz con recuperación autoritativa;
- Pedidos `FULFILLED` descubribles para cierre sin UUID hardcodeado;
- cierre con `expectedVersion` y recuperación autoritativa;
- auditoría acotada por Pedido desde la misma superficie;
- helpers de recuperación probados para asignación y cierre.

### Fase 4.5

- entrega activa sin UUID hardcodeado;
- retiro y custodia con evidencia estructurada;
- traslado y llegada desde interfaz;
- intención final idempotente e inmutable en memoria;
- recuperación segura de transiciones normales y confirmación final;
- PIN, receptor y efectivo tratados sin persistir el secreto;
- tests de cliente HTTP, intención y decisiones de recuperación.

### Fase 4.6 y hardening de destino

- Playwright/Chromium móvil recorre la vertical completa sin retries sobre estado mutado;
- recuperación real ante pérdida deliberada de respuestas de comercio y entrega final;
- dirección/teléfono ausentes de storage del navegador;
- destino oculto al repartidor antes de `PICKED_UP` y visible después de la custodia;
- contrato `ApiClient`, intención Cliente y respuesta Repartidor comparten los mismos tipos.

## Fuera de alcance actual

- mapa, geocoding y agenda/perfil de direcciones;
- funciones avanzadas de comercio fuera de DEV-001;
- PWA offline completa;
- autenticación productiva;
- recuperación durable del PIN;
- identidad visual final / Design System completo;
- router o store global sin necesidad demostrada.

## Criterio para dependencias nuevas

Router, store global, cliente HTTP externo, motor de persistencia offline o primitives adicionales
solo se incorporan cuando una necesidad verificable no pueda resolverse razonablemente con la
base actual. Cada incorporación debe justificar costo, alcance, QA y estrategia de recuperación.
