# ADR-006 — Frontera de identidad productiva

**Estado:** ACCEPTED FOR IMPLEMENTATION — proveedor OIDC autoalojado; endpoints concretos quedan
pendientes de levantar el entorno local de identidad.

## Contexto

La primera vertical usa `x-dev-actor-id` únicamente en `development` y `test`. Ese mecanismo permite
probar roles y alcance, pero no demuestra identidad de una persona ni es válido para el piloto.

El piloto necesita separar autenticación, autorización y dominio sin acoplar el código de negocio a
un proveedor específico.

## Decisión propuesta

UspaYa adoptará una frontera OIDC/OAuth 2.0 con estas responsabilidades:

```text
Proveedor OIDC → frontend obtiene sesión con Authorization Code + PKCE
               → API recibe access token Bearer
               → adaptador valida JWT (issuer, audience, expiración y firma)
               → mapea sub a User interno
               → RolesGuard aplica roles y scopes del User interno
               → dominio recibe RequestActor, nunca un token crudo
```

La primera implementación usará Keycloak autoalojado como proveedor OIDC open source. El adaptador
de la API debe conservar una frontera intercambiable para no acoplar el dominio al proveedor. La API
no confiará en un `role` recibido directamente desde el
navegador: los roles y scopes efectivos se resolverán contra la identidad interna y sus asignaciones
persistidas.

## Contrato mínimo de la API

- `Authorization: Bearer <access-token>` en rutas protegidas;
- `iss`, `aud`, `sub`, `exp` y firma válidos;
- `sub` estable y mapeable a un `User` activo;
- rechazo de tokens vencidos, de otro issuer, de otra audiencia o con firma inválida;
- respuesta `401` sin filtrar si el token es ausente o inválido;
- respuesta `403` si la identidad válida no posee el rol o scope requerido;
- `x-dev-actor-id` rechazado fuera de `development` y `test`;
- `correlationId` conservado en todos los rechazos.

## Reglas de privacidad y sesión

- el PIN, tokens y secretos no se escriben en logs, auditoría ni URLs;
- el frontend no persistirá access tokens en `localStorage` ni `sessionStorage`;
- la sesión deberá usar memoria y el mecanismo seguro recomendado por el proveedor;
- los claims no necesarios no se copian al dominio ni a respuestas de identidad;
- logout, expiración y revocación deben impedir nuevas mutaciones.

## Configuración requerida

Los nombres concretos quedan sujetos al proveedor, pero la aplicación necesitará como mínimo:

- issuer OIDC;
- audience de la API;
- JWKS URL o mecanismo equivalente de claves;
- client ID público del frontend;
- URL de callback y logout;
- política de claims para `sub`, email/display name y grupos/roles;
- allowlist de origins y redirects por entorno.

Los secretos no se almacenan en Git ni en imágenes Docker. La configuración productiva debe fallar
cerrado si falta issuer, audience, claves o callback válido.

## Decisión de operación

- No se incorpora un proveedor SaaS ni un costo por usuario.
- Keycloak se ejecuta como servicio propio, con configuración reproducible y persistencia respaldada.
- El costo aceptado es operativo: actualizaciones, backups, monitoreo y recuperación del servicio.
- La configuración local/de prueba puede usar un realm sintético; ningún secreto ni realm productivo
  se incorpora al repositorio.

## Fuera de este ADR

- selección comercial del proveedor;
- diseño visual del login;
- recuperación de cuenta y MFA;
- autorización del fallback de PIN;
- despliegue concreto y almacenamiento de secretos.

## Criterios de aceptación

- una persona autenticada sólo ve y muta recursos de sus roles y scopes;
- un usuario válido sin permiso recibe `403` y no obtiene datos ajenos;
- tokens inválidos, vencidos o de otro entorno reciben `401`;
- el selector y header de desarrollo no funcionan en producción;
- el actor interno mantiene el mismo contrato `RequestActor` usado por el dominio;
- tests de integración y E2E cubren login, expiración, acceso cruzado y logout.

## Próxima implementación

Levantar Keycloak en un perfil local aislado, registrar el contrato de issuer/audience/JWKS y
implementar el adaptador productivo antes de habilitar cualquier build de piloto.
