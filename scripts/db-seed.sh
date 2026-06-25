#!/usr/bin/env bash
# Apply the minimal seed (one QA user + one workspace) on top of migrations.
# Local/CI/staging-local only. Assumes migrations have already been applied
# (run scripts/db-migrate.sh first, or use `pnpm db:reset`).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:${ARTHER_DB_PORT:-54329}/arther}"

echo "seeding qa account + workspace"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -f "${ROOT}/scripts/sql/0001_seed.sql"
echo "seed applied"
