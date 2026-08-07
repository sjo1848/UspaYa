# WEB-001 — Contrato frontend de la primera vertical

## Estado

Fase 4 en curso. Este documento gobierna la frontera web de la vertical ya cerrada por API-001.
No redefine estados, permisos ni reglas de negocio.

## Fuente de autoridad

1. decisiones aprobadas y ADR aceptadas;
2. DOM-006 para estados, comandos y eventos;
3. API-001 para contratos HTTP, errores y autorización;
4. UX-003 a UX-007 para comportamiento de interfaz y recuperación;
5. WEB-001 para decisiones específicas de implementación frontend.

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

## Alcance de Fase 4.1

Incluye:

- shell funcional;
- cliente HTTP;
- actor de desarrollo;
- health e identidad efectiva;
- proxy local;
- helper de intención idempotente;
- representación básica de conectividad y error;
- tests unitarios de la frontera web.

No incluye todavía:

- catálogo y carrito;
- creación o seguimiento visual de pedido;
- superficies del comercio;
- superficies de operaciones;
- superficies del repartidor;
- PWA offline completa;
- autenticación productiva;
- Design System completo.

## Criterio para dependencias nuevas

Router, store global, librería de UI, cliente HTTP externo o motor de persistencia offline solo se
incorporan cuando exista una necesidad verificable que la alternativa más simple no pueda cubrir.
Cada incorporación debe justificar costo, alcance, QA y estrategia de recuperación.
