# Gate A — Validación técnica local de #57

**Fecha:** 2026-08-11 (America/Argentina/Buenos_Aires)
**Entorno:** Docker local controlado; revisión candidata sin publicar
**Resultado:** controles técnicos reproducibles aprobados; hosting y responsables pendientes.

## Imágenes

Las tres imágenes se construyeron desde el mismo árbol y conservaron la etiqueta OCI de revisión:

| Servicio | Tamaño aproximado | Usuario runtime               | Resultado                        |
| -------- | ----------------: | ----------------------------- | -------------------------------- |
| API      |            208 MB | `uspaya` (`10001`)            | build y health correctos         |
| web      |             23 MB | Nginx no privilegiado (`101`) | build, proxy y health correctos  |
| worker   |            208 MB | `uspaya` (`10001`)            | ejecución única y salida `ready` |

Los identificadores definitivos deben tomarse del CI del commit publicado. Los identificadores de
esta corrida local no se presentan como release porque el árbol aún no tenía un SHA propio.

## Smoke del conjunto

- PostgreSQL quedó saludable.
- API arrancó con identidad de desarrollo deshabilitada y autenticación interna configurada.
- `GET /health` de web devolvió `200`.
- `GET /api/v1/health` vía web devolvió `status=ok` y `database=ok`.
- `gate-a-final-smoke` atravesó Nginx, llegó a la API y apareció en logs estructurados.
- El worker ejecutó Outbox y terminó con `status=ready`, `failed=0`.
- La CSP de web no contiene `unsafe-inline` ni `unsafe-eval`.
- Web, API y worker se ejecutaron como usuarios no privilegiados.

## PostgreSQL

- Backup custom de PostgreSQL creado y verificado con SHA-256.
- Restore ejecutado en una base aislada y temporal.
- Restore validado con 4 migraciones terminadas y 32 usuarios.
- La base temporal fue eliminada automáticamente; la base operativa no se reemplazó.

## Rollback

El script de rollback fue ejecutado con una revisión candidata ya construida y ambos healthchecks
quedaron verdes. Esto valida el mecanismo, la exigencia de imágenes existentes y el chequeo de salud.

La compatibilidad real entre dos releases sigue pendiente porque #57 crea la primera release
containerizada. Debe probarse con el primer despliegue N+1 antes de marcar A7 como cerrado.

## Pruebas

- API unitarias: 33 aprobadas.
- Web unitarias: 25 aprobadas.
- Worker: 1 aprobada.
- Integración PostgreSQL en base aislada: 75 aprobadas, 0 fallos.
- Backup/restore aislado: aprobado.
- Build y smoke de las tres imágenes: aprobado.

Una ejecución inicial contra la base de desarrollo reutilizada encontró una asignación activa de
pruebas anteriores. La misma suite pasó completa al ejecutarse desde migraciones y seed en una base
aislada, que es la condición usada por CI y la evidencia válida.
