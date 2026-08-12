# Gate A — Runbook técnico del piloto

**Estado:** implementación técnica en #57; no autoriza pedidos reales.
**Alcance:** imágenes, configuración, observabilidad y recuperación controlada.

## Imágenes reproducibles

Construir desde un commit aprobado y limpio:

```bash
infra/scripts/build-pilot-images.sh "$(git rev-parse HEAD)"
```

El comando exige un SHA completo, etiqueta `uspaya-api`, `uspaya-web` y `uspaya-worker`, incorpora
`org.opencontainers.image.revision` y publica el identificador local de contenido de cada imagen.
La evidencia del piloto debe conservar el SHA, los tres identificadores y el registro de CI.
Las bases Node, Nginx y PostgreSQL están fijadas por versión y digest de contenido.

La API y el worker se ejecutan como usuario no privilegiado sobre Node `24.18.0`. La web se sirve
como contenido estático mediante Nginx y reenvía `/api` a la API. TLS debe terminar en el proxy o
servicio frontal elegido; el Compose no publica una terminación TLS propia.

## Configuración

`config/environments/pilot.example` contiene el contrato de variables sin valores reales. Para
validar una copia privada:

```bash
docker compose --env-file /ruta/privada/pilot.env \
  -f compose.yaml -f compose.pilot.yaml config --quiet
```

`DATABASE_URL`, `POSTGRES_PASSWORD` y `AUTH_JWT_SECRET` son secretos. No se copian a imágenes, logs,
tickets ni evidencia. El despliegue falla antes de arrancar si falta la revisión, la URL de base o
el secreto JWT. `AUTH_COOKIE_SECURE` permanece forzado a `true`.

## Arranque y señales

```bash
docker compose --env-file /ruta/privada/pilot.env \
  -f compose.yaml -f compose.pilot.yaml up -d postgres api web

docker compose --env-file /ruta/privada/pilot.env \
  -f compose.yaml -f compose.pilot.yaml run --rm worker
```

Señales mínimas:

- web: `GET /health` devuelve `200`;
- API: `GET /api/v1/health` devuelve `200` y `x-correlation-id`;
- worker: termina con código `0` y emite un snapshot JSON con `status=ready`;
- API, web y worker escriben logs JSON en stdout/stderr;
- los logs de API registran método, path sin query string, estado, duración, actor cuando existe y
  `correlationId`;
- contraseñas, PIN, cookies, tokens y credenciales de PostgreSQL se redactan.

El worker actual es un job de una ejecución, no un daemon: su healthcheck es el código de salida y
el snapshot estructurado, no un endpoint persistente.

## Backup y restore aislado

```bash
backup_output="$(mktemp -d)"
infra/scripts/backup-postgres.sh "$backup_output"
infra/scripts/verify-postgres-recovery.sh "$backup_output"/*.dump
```

La verificación crea una base temporal con nombre acotado, restaura el dump, comprueba migraciones
terminadas y usuarios, y elimina sólo esa base temporal al finalizar. No modifica la base operativa.

## Rollback de aplicación

El rollback usa una revisión de 40 caracteres cuyas tres imágenes ya deben existir localmente:

```bash
infra/scripts/rollback-pilot.sh REVISION_SHA --confirm
```

El script cambia API/web a esa revisión sin reconstruir y exige health saludable vía web y proxy.
Antes de desplegar una migración no aditiva se requiere backup verificado y una prueba específica de
compatibilidad con la revisión anterior; las migraciones Prisma no se revierten automáticamente.

## Evidencia a archivar

- commit y CI;
- identificadores de las tres imágenes;
- salida sanitizada de healthchecks y worker;
- un `correlationId` seguido entre web/API;
- ruta privada, checksum y fecha del backup, sin adjuntar el dump al repositorio;
- salida de restore aislado;
- revisión anterior y resultado del rollback;
- responsable que ejecutó y aprobó cada control.
