# WEB-001 — Contrato frontend de la primera vertical

## Estado

Fase 4 en curso. Fase 4.1, fundación UI 4.1.1 y el flujo cliente 4.2 están implementados en la rama
de integración. Este documento gobierna la frontera web de la vertical ya cerrada por API-001. No
redefine estados, permisos ni reglas de negocio.

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
- PIN, secretos y credenciales no se persisten en storage del navegador.
- Los estados visibles se expresan por texto; no dependen únicamente de color.
- Las acciones críticas usan controles táctiles adecuados y foco visible.

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
→ PIN
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
- payload exacto de la intención.

Un doble toque no crea una segunda intención mientras el envío está activo. Si es necesario
reintentar la misma operación, se reutilizan exactamente la misma clave, IDs y payload.

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

## Fuera de alcance actual

- superficies funcionales de comercio, operaciones y repartidor;
- PWA offline completa;
- autenticación productiva;
- recuperación durable del PIN;
- identidad visual final / Design System completo;
- router o store global sin necesidad demostrada.

## Criterio para dependencias nuevas

Router, store global, cliente HTTP externo, motor de persistencia offline o primitives adicionales
solo se incorporan cuando una necesidad verificable no pueda resolverse razonablemente con la
base actual. Cada incorporación debe justificar costo, alcance, QA y estrategia de recuperación.
