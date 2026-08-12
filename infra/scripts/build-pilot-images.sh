#!/usr/bin/env bash

set -euo pipefail

revision="${1:-$(git rev-parse HEAD)}"

if [[ ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'La revisión debe ser un SHA Git completo de 40 caracteres.\n' >&2
  exit 2
fi

docker build \
  --pull \
  --target api \
  --label "org.opencontainers.image.revision=${revision}" \
  --tag "uspaya-api:${revision}" \
  --file infra/docker/Dockerfile.node \
  .

docker build \
  --pull \
  --label "org.opencontainers.image.revision=${revision}" \
  --tag "uspaya-web:${revision}" \
  --file infra/docker/Dockerfile.web \
  .

docker build \
  --target worker \
  --label "org.opencontainers.image.revision=${revision}" \
  --tag "uspaya-worker:${revision}" \
  --file infra/docker/Dockerfile.node \
  .

for service in api web worker; do
  image="uspaya-${service}:${revision}"
  image_id="$(docker image inspect --format '{{.Id}}' "$image")"
  source_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
  printf '%s image=%s digest=%s revision=%s\n' "$service" "$image" "$image_id" "$source_revision"
done
