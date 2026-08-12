#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 || ! -s "$1" ]]; then
  printf 'Uso: %s BACKUP.dump\n' "$0" >&2
  exit 2
fi

backup_path="$1"
database="uspaya_restore_verify_$(date -u +%Y%m%d%H%M%S)_$$"

if [[ ! "$database" =~ ^uspaya_restore_verify_[0-9_]+$ ]]; then
  printf 'Nombre de base de verificación inválido.\n' >&2
  exit 1
fi

cleanup() {
  docker compose exec -T postgres dropdb \
    --if-exists \
    --force \
    --username="${POSTGRES_USER:-uspaya}" \
    "$database" >/dev/null
}
trap cleanup EXIT

docker compose exec -T postgres createdb \
  --username="${POSTGRES_USER:-uspaya}" \
  "$database"

docker compose exec -T postgres pg_restore \
  --no-owner \
  --no-acl \
  --username="${POSTGRES_USER:-uspaya}" \
  --dbname="$database" < "$backup_path"

migration_count="$(docker compose exec -T postgres psql \
  --tuples-only \
  --no-align \
  --username="${POSTGRES_USER:-uspaya}" \
  --dbname="$database" \
  --command='SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')"

user_count="$(docker compose exec -T postgres psql \
  --tuples-only \
  --no-align \
  --username="${POSTGRES_USER:-uspaya}" \
  --dbname="$database" \
  --command='SELECT count(*) FROM "User";')"

if [[ "$migration_count" -lt 1 || "$user_count" -lt 1 ]]; then
  printf 'Restore inválido: migrations=%s users=%s\n' "$migration_count" "$user_count" >&2
  exit 1
fi

printf 'Restore verificado en base aislada: migrations=%s users=%s\n' "$migration_count" "$user_count"
