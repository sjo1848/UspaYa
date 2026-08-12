# Gate A — Matriz de configuración y secretos

Los nombres son contrato; los valores reales pertenecen al almacén de secretos del entorno.

| Variable                  | Local           | CI               | Piloto                               | Sensible | Responsable requerido |
| ------------------------- | --------------- | ---------------- | ------------------------------------ | -------- | --------------------- |
| `USPAYA_IMAGE_REVISION`   | SHA local       | SHA del checkout | SHA aprobado                         | No       | Release técnico       |
| `DATABASE_URL`            | `.env` ignorado | secreto efímero  | almacén de secretos                  | Sí       | Base de datos         |
| `POSTGRES_PASSWORD`       | sólo desarrollo | secreto efímero  | almacén de secretos                  | Sí       | Base de datos         |
| `AUTH_JWT_SECRET`         | secreto local   | secreto efímero  | almacén de secretos, mínimo 32 bytes | Sí       | Seguridad/operación   |
| `AUTH_JWT_ISSUER`         | `uspaya-api`    | `uspaya-api`     | valor por entorno                    | No       | Release técnico       |
| `AUTH_JWT_AUDIENCE`       | `uspaya-web`    | `uspaya-web`     | valor por entorno                    | No       | Release técnico       |
| `AUTH_ACCESS_TTL_SECONDS` | `900`           | `900`            | 60–3600                              | No       | Seguridad/operación   |
| `AUTH_TRUST_PROXY_HOPS`   | `0`             | `0`              | topología real, 0–3                  | No       | Infraestructura       |
| `PILOT_API_BIND`          | loopback        | no aplica        | loopback/red privada                 | No       | Infraestructura       |
| `PILOT_WEB_BIND`          | loopback        | no aplica        | entrada del proxy                    | No       | Infraestructura       |

## Controles

- Nunca versionar archivos con valores de piloto.
- Rotar el secreto JWT mediante procedimiento que invalide sesiones existentes de forma explícita.
- No reutilizar contraseñas ni secretos entre CI, staging y piloto.
- Limitar lectura y escritura del almacén a responsables nominales.
- Registrar fecha de rotación y responsable, no el valor.
- Confirmar `AUTH_TRUST_PROXY_HOPS` contra la topología antes de abrir login; un valor incorrecto
  invalida el límite de intentos por origen.

## Decisiones externas pendientes

- tecnología y ubicación del almacén de secretos;
- custodio primario y reemplazo;
- política y ventana de rotación;
- host, terminación TLS y cantidad exacta de proxies confiables.
