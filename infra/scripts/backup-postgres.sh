#!/usr/bin/env bash

set -euo pipefail

backup_dir="${1:-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="${backup_dir%/}/uspaya-${timestamp}.dump"

mkdir -p "$backup_dir"

docker compose exec -T postgres pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --username="${POSTGRES_USER:-uspaya}" \
  "${POSTGRES_DB:-uspaya}" > "$backup_path"

if [[ ! -s "$backup_path" ]]; then
  printf 'Backup vacío: %s\n' "$backup_path" >&2
  exit 1
fi

printf 'Backup creado: %s\n' "$backup_path"
