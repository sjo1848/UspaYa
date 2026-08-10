# ADR-006 — Frontera de identidad productiva

**Estado:** ACCEPTED FOR IMPLEMENTATION — identidad interna dentro de la API; no se incorpora un
proveedor ni servicio de autenticación separado.

## Contexto

La primera vertical usa `x-dev-actor-id` únicamente en `development` y `test`. Ese mecanismo permite
probar roles y alcance, pero no demuestra identidad de una persona ni es válido para el piloto.

El piloto necesita separar autenticación, autorización y dominio sin acoplar el código de negocio a
un proveedor específico.

## Decisión

UspaYa adoptará una frontera de identidad interna con estas responsabilidades:

```text
Frontend → API autentica credenciales y crea sesión rotada
         → API emite access token JWT de corta duración
         → guard valida firma, issuer, audience y expiración
         → mapea subject a User interno
         → RolesGuard aplica roles y scopes de PostgreSQL
         → dominio recibe RequestActor, nunca un token crudo
```

La primera implementación mantendrá autenticación y emisión de tokens dentro de la API. La API
usará credenciales almacenadas con hash resistente, sesiones rotables y JWT de acceso firmados con
claves gestionadas por el propio despliegue. La API no confiará en un `role` recibido directamente
desde el
navegador: los roles y scopes efectivos se resolverán contra la identidad interna y sus asignaciones
persistidas.

## Contrato mínimo de la API

- `Authorization: Bearer <access-token>` en rutas protegidas;
- `iss`, `aud`, `sub`, `exp`, `jti` y firma válidos;
- `sub` estable y mapeable a un `User` activo;
- rechazo de tokens vencidos, de otro issuer, de otra audiencia o con firma inválida;
- respuesta `401` sin filtrar si el token es ausente o inválido;
- respuesta `403` si la identidad válida no posee el rol o scope requerido;
- `x-dev-actor-id` rechazado fuera de `development` y `test`;
- `correlationId` conservado en todos los rechazos.

## Reglas de privacidad y sesión

- el PIN, tokens y secretos no se escriben en logs, auditoría ni URLs;
- el frontend no persistirá access tokens en `localStorage` ni `sessionStorage`;
- el refresh token se almacenará sólo en cookie `HttpOnly`, `Secure`, `SameSite` apropiada;
- los claims no necesarios no se copian al dominio ni a respuestas de identidad;
- logout, expiración y revocación deben impedir nuevas mutaciones.

## Configuración requerida

- issuer interno;
- audience de la API;
- clave privada de firma y mecanismo de rotación;
- duración de access y refresh tokens;
- allowlist de origins y cookies por entorno;
- política de hash de contraseñas y límite de intentos;
- procedimiento de invalidación de sesiones y recuperación de cuenta.

Los secretos no se almacenan en Git ni en imágenes Docker. La configuración productiva debe fallar
cerrado si falta issuer, audience, claves o callback válido.

## Decisión de operación

- No se incorpora un proveedor SaaS ni un servicio de identidad separado.
- El API será responsable de login, emisión, expiración, rotación y revocación de sesiones.
- Los secretos y claves se inyectan por entorno y nunca se almacenan en Git ni en imágenes.
- El costo aceptado es la complejidad operativa dentro del propio servicio, cubierta con pruebas y
  un runbook de recuperación.

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

Implementar el módulo interno de identidad, agregar la relación estable de sesión/token con `User`
y completar A2 antes de habilitar cualquier build de piloto.
