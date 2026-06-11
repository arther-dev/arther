#!/usr/bin/env bash
# Start the local Postgres 17 container for migrations + DB tests.
set -euo pipefail

CONTAINER=arther-postgres
PORT="${ARTHER_DB_PORT:-54329}"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "${CONTAINER} already running on port ${PORT}"
  exit 0
fi

docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true

docker run -d \
  --name "${CONTAINER}" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=arther \
  -p "${PORT}:5432" \
  postgres:17 >/dev/null

echo -n "waiting for postgres"
for _ in $(seq 1 60); do
  if docker exec "${CONTAINER}" pg_isready -U postgres -d arther >/dev/null 2>&1; then
    echo " — ready on localhost:${PORT}"
    exit 0
  fi
  echo -n "."
  sleep 0.5
done

echo " — timed out" >&2
docker logs "${CONTAINER}" >&2 || true
exit 1
