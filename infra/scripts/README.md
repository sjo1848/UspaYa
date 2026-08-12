# Scripts de infraestructura

Este directorio contiene scripts reproducibles de migración, semillas, copias de seguridad y
recuperación.

## Backup y restore local

Con PostgreSQL levantado:

```bash
./infra/scripts/backup-postgres.sh ./backups
./infra/scripts/restore-postgres.sh ./backups/uspaya-YYYYMMDDTHHMMSSZ.dump --confirm
```

El restore es destructivo sobre la base configurada y exige `--confirm`. Los archivos de backup no
deben commitearse ni contenerse en imágenes Docker. Antes del piloto, el mismo procedimiento debe
probarse en un entorno controlado y registrarse en la evidencia operativa.

`verify-postgres-recovery.sh BACKUP.dump` restaura en una base temporal aislada, valida migraciones
y usuarios y elimina sólo esa base al terminar.

## Imágenes y rollback del piloto

`build-pilot-images.sh REVISION_SHA` construye las imágenes versionadas de API, web y worker y
publica sus identificadores de contenido.

`rollback-pilot.sh REVISION_SHA --confirm` exige que las tres imágenes de esa revisión ya existan,
despliega API/web sin reconstruir y verifica health a través del proxy web.

El contrato completo está en `docs/06-operations/GATE-A-TECHNICAL-RUNBOOK.md`.
