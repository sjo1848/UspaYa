# Validación de autenticación interna (#56)

**Fecha de ejecución:** 2026-08-11 (America/Argentina/Buenos_Aires)  
**Commit validado:** `0cd1d3b` (`feat(auth): complete secure session flow`)  
**CI:** [run 31546177432](https://github.com/sjo1848/UspaYa/actions/runs/31546177432), `success`

## Precondiciones y migraciones

- PostgreSQL `17-alpine` levantado con `docker compose`.
- Migraciones aplicadas desde una base vacía, incluyendo:
  - `20260810190000_internal_auth_sessions`.
  - `20260810210000_auth_login_throttle`.
- Seed determinista ejecutado.
- API ejecutada con `NODE_ENV=production`, `DEV_IDENTITY_ENABLED=false`,
  `AUTH_COOKIE_SECURE=true` y `AUTH_TRUST_PROXY_HOPS=0`.
- Las cuatro cuentas seed fueron provisionadas mediante el bootstrap interactivo. No se
  conservaron contraseñas, JWT ni refresh tokens en la evidencia.

## Evidencia ejecutada

| Control | Resultado observado |
| --- | --- |
| Health público | `200`, respuesta `status=ok` y header `x-correlation-id` |
| Endpoint protegido sin credenciales | `401` |
| Login cliente | `200`; actor `CUSTOMER` y scopes propios |
| Cliente consulta catálogo | `200` |
| Repartidor consulta catálogo | `403 ROLE_FORBIDDEN` |
| Refresh | `200`; sesión rotada y refresh anterior rechazado con `401` |
| Logout | `204`; access token y refresh token de la sesión quedaron rechazados con `401` |

La prueba de permisos cruzados cubre explícitamente la separación `CUSTOMER`/`COURIER` sobre
catálogo; la suite de integración existente cubre además las fronteras de operaciones,
comercio y repartidor en la vertical completa.

## Validación complementaria

`pnpm test:integration` terminó con **75 tests, 0 fallos**. La ejecución local mostró una
advertencia de engine porque el entorno disponible usa Node `22.13.0`; el CI del commit validado
ejecutó con Node `24.18.0`, que es la versión declarada por el repositorio.

## Criterio de cierre

El bloque #56 queda validado para pasar a Gate A. La evidencia de despliegue, secretos por entorno,
backup/restore/rollback y operación del piloto permanece fuera de este cierre y corresponde al
Gate A.
