#!/usr/bin/env bash
# Apply the local auth shim, then the canonical migrations, in order.
# Local/CI only — on a real Supabase project, use `supabase db push` (no shim).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:${ARTHER_DB_PORT:-54329}/arther}"

run() {
  echo "applying $(basename "$1")"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -f "$1"
}

run "${ROOT}/scripts/sql/0000_local_auth_shim.sql"

for f in "${ROOT}"/supabase/migrations/*.sql; do
  run "$f"
done

echo "migrations applied"
