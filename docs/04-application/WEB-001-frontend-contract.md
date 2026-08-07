# WEB-001 — Contrato frontend de la primera vertical

## Estado

Fase 4 en curso. Fase 4.1 y la fundación UI 4.1.1 están implementadas en la rama de integración.
Este documento gobierna la frontera web de la vertical ya cerrada por API-001. No redefine estados,
permisos ni reglas de negocio.

## Fuente de autoridad

1. decisiones aprobadas y ADR aceptadas;
2. DOM-006 para estados, comandos y eventos;
3. API-001 para contratos HTTP, errores y autorización;
4. UX-003 a UX-007 para comportamiento de interfaz y recuperación;
5. ADR-005 para stack y estrategia de UI;
6. WEB-001 para decisiones específicas de implementación frontend.

Ante una contradicción, el frontend se corrige; no se introduce una regla paralela.

## Principios

- El backend es autoritativo para identidad, roles, alcances y estado de negocio.
- La interfaz no presenta una mutación como confirmada sin respuesta autoritativa o recuperación por
  consulta del estado.
- Un fallo de red no equivale a rechazo ni a éxito.
- `correlationId` se conserva para diagnóstico cuando la API lo devuelve.
- `VERSION_CONFLICT` obliga a refrescar antes de ofrecer una nueva mutación.
- Una intención idempotente conserva la misma `Idempotency-Key` durante sus reintentos lógicos.
- Una nueva intención recibe una clave nueva.
- PIN, secretos y credenciales no se persisten en storage del navegador.
- Los estados visibles se expresan por texto; no dependen únicamente de color.
- Las acciones críticas usan controles táctiles de al menos 44 px y foco visible.

## Stack UI — ADR-005

La base de interfaz utiliza:

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
- los componentes de negocio de UspaYa viven fuera de `components/ui` y componen esos primitives;
- Tailwind v4 se integra mediante `@tailwindcss/vite`;
- el alias `@/*` apunta a `src/*` tanto en TypeScript como en Vite;
- `components.json` conserva la configuración del registry y los aliases;
- tokens y variables CSS son la base del diseño; el preset neutral es un punto de partida, no la
  identidad visual final;
- no se incorpora un catálogo completo de componentes de forma anticipada.

Primitives iniciales incorporados:

- Button;
- Input;
- Label;
- Card;
- Select;
- Badge;
- Alert;
- Separator;
- Skeleton.

`Sheet`, `Dialog` y otros primitives se agregan únicamente cuando un flujo funcional los necesite.

La aplicación no depende de una fuente remota para renderizar su tipografía base. Se utiliza un
stack de fuentes del sistema para no introducir una dependencia innecesaria de red en una PWA que
debe tolerar conectividad irregular.

## Política de dependencias y scripts de instalación

El uso de shadcn-vue no relaja la política de supply chain del monorepo. Los scripts de instalación
de dependencias continúan bloqueados por defecto mediante pnpm.

`vue-demi` está aprobado de forma explícita en `pnpm-workspace.yaml` porque su postinstall revisado
configura la compatibilidad con la versión de Vue instalada. Esta excepción no autoriza scripts de
build de otras dependencias.

El código generado por shadcn-vue pasa por el mismo formato, typecheck, tests y build que el resto
del frontend.

## Cliente HTTP

La Fase 4.1 usa `fetch` nativo mediante un único `ApiClient` tipado.

Responsabilidades:

- prefijo `/api/v1`;
- JSON request/response;
- `x-dev-actor-id` únicamente cuando el llamador lo solicita en development/test;
- `Idempotency-Key` para operaciones que API-001 la exige;
- `x-correlation-id` cuando exista una correlación explícita;
- error HTTP estable con status, code, message, correlationId y details;
- error de red separado de un error HTTP autoritativo;
- soporte de `AbortSignal` para descartar consultas obsoletas.

No se incorpora Axios ni otra capa HTTP mientras `fetch` cubra el contrato.

## Identidad de desarrollo

Los cuatro actores sembrados pueden seleccionarse en el shell únicamente durante development/test.
El selector es una herramienta de QA y desarrollo, no autenticación.

Al cambiar actor:

1. se conserva la selección local;
2. se consulta `/actors/me`;
3. la UI presenta displayName, roles y alcances que devuelve la API;
4. cualquier autorización posterior vuelve a ser decidida por el backend.

Ocultar el selector en un build productivo no constituye una medida de seguridad. La API debe
seguir fallando cerrada fuera de los entornos permitidos.

## Desarrollo local

Vite reenvía `/api` a `http://127.0.0.1:3000`.

Objetivos:

- mantener mismo origen desde la perspectiva del navegador durante desarrollo;
- evitar habilitar CORS permisivo únicamente por conveniencia local;
- mantener el código frontend independiente del host absoluto de la API.

## Estado transversal de petición

La primera implementación usa estado local y cuatro estados básicos:

```text
idle
loading
success
error
```

No se introduce Pinia, otro store global ni router hasta que una necesidad concreta de las
superficies 4.2–4.5 demuestre que el estado local deja de ser suficiente.

## Conectividad y resultado incierto

`navigator.onLine` es una señal de interfaz, no evidencia de disponibilidad de la API. La salud
real se comprueba contra `/health`.

Ante fallo de red durante una consulta:

- se informa que la API no pudo ser confirmada;
- se preserva el contexto no sensible necesario para reintentar;
- no se fabrica un estado comercial.

Ante fallo de red durante una mutación crítica futura:

- la intención queda pendiente o incierta;
- si la operación es idempotente, se conserva su clave;
- al recuperar conexión se consulta primero el estado autoritativo cuando exista riesgo de que la
  mutación haya llegado al servidor;
- solo después se decide si corresponde reintentar.

## Alcance completado de Fase 4.1 y 4.1.1

Incluye:

- shell funcional;
- cliente HTTP;
- actor de desarrollo;
- health e identidad efectiva;
- proxy local;
- helper de intención idempotente;
- representación básica de conectividad y error;
- tests unitarios de la frontera web;
- Tailwind CSS v4;
- shadcn-vue y primitives iniciales;
- tokens CSS y aliases de UI;
- smoke proof del shell utilizando Button y Badge de shadcn-vue.

No incluye todavía:

- catálogo y carrito funcionales;
- creación o seguimiento visual de pedido;
- superficies del comercio;
- superficies de operaciones;
- superficies del repartidor;
- PWA offline completa;
- autenticación productiva;
- identidad visual final ni Design System completo.

## Criterio para dependencias nuevas

La selección de Tailwind CSS v4 + shadcn-vue ya está resuelta por ADR-005. Otras dependencias como
router, store global, cliente HTTP externo, motor de persistencia offline o primitives adicionales
solo se incorporan cuando exista una necesidad verificable que la alternativa actual no pueda
cubrir. Cada incorporación debe justificar costo, alcance, QA y estrategia de recuperación.
