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
