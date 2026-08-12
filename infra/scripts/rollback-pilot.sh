#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 2 || "$2" != "--confirm" || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Uso: %s REVISION_SHA --confirm\n' "$0" >&2
  exit 2
fi

export USPAYA_IMAGE_REVISION="$1"

for service in api web worker; do
  docker image inspect "uspaya-${service}:${USPAYA_IMAGE_REVISION}" >/dev/null
done

docker compose -f compose.yaml -f compose.pilot.yaml up -d --no-build api web

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8080/health >/dev/null \
    && curl --fail --silent http://127.0.0.1:8080/api/v1/health >/dev/null; then
    printf 'Rollback desplegado y saludable: %s\n' "$USPAYA_IMAGE_REVISION"
    exit 0
  fi
  sleep 1
done

printf 'El rollback no alcanzó estado saludable.\n' >&2
exit 1
