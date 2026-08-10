#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 2 || "$2" != "--confirm" ]]; then
  printf 'Uso: %s BACKUP.dump --confirm\n' "$0" >&2
  printf 'La restauración reemplaza los datos de la base configurada.\n' >&2
  exit 2
fi

backup_path="$1"

if [[ ! -f "$backup_path" || ! -s "$backup_path" ]]; then
  printf 'Backup inexistente o vacío: %s\n' "$backup_path" >&2
  exit 1
fi

docker compose exec -T postgres pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --username="${POSTGRES_USER:-uspaya}" \
  --dbname="${POSTGRES_DB:-uspaya}" < "$backup_path"

printf 'Restore completado desde: %s\n' "$backup_path"
