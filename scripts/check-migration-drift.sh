#!/usr/bin/env bash
# The canonical migrations (supabase/migrations/, timestamp-prefixed) must stay
# byte-identical to the documented reference copies
# (Development/Architecture/migrations/, number-prefixed). A genuine schema fix
# updates BOTH and says so in the commit. See supabase/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF_DIR="${ROOT}/Development/Architecture/migrations"
CANON_DIR="${ROOT}/supabase/migrations"
status=0

for ref in "${REF_DIR}"/0*.sql; do
  name="$(basename "$ref")"            # e.g. 0003_spec_database.sql
  num="${name%%_*}"                    # 0003
  rest="${name#*_}"                    # spec_database.sql
  canon="${CANON_DIR}/202606080000${num#00}_${rest}"
  if [[ ! -f "$canon" ]]; then
    echo "DRIFT: missing canonical copy for ${name} (expected $(basename "$canon"))" >&2
    status=1
    continue
  fi
  if ! cmp -s "$ref" "$canon"; then
    echo "DRIFT: ${name} differs from $(basename "$canon")" >&2
    status=1
  fi
done

ref_count=$(find "${REF_DIR}" -maxdepth 1 -name '0*.sql' | wc -l)
canon_count=$(find "${CANON_DIR}" -maxdepth 1 -name '*.sql' | wc -l)
if [[ "$ref_count" -ne "$canon_count" ]]; then
  echo "DRIFT: ${ref_count} reference migrations vs ${canon_count} canonical migrations" >&2
  status=1
fi

if [[ $status -eq 0 ]]; then
  echo "migration copies in sync (${ref_count} files)"
fi
exit $status
