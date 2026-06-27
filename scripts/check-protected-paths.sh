#!/usr/bin/env bash
# Guardrail for the autonomous self-merge loop.
#
# With full self-merge on green CI there is no human reviewer, so changes to
# dangerous areas (schema, auth, RLS, billing, the CI gate itself) must instead
# FAIL CI unless the owner has explicitly approved them via the `human-approved`
# label. This script diffs the PR against its base and fails if any changed file
# matches a protected pattern and the override is not set.
#
# Override: set GUARDRAIL_OVERRIDE=1 (CI passes this when the PR carries the
# `human-approved` label). See Development/Autonomous/guardrails.md.
set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"

# Resolve the merge base so we only inspect what this PR actually changes.
if ! git rev-parse --verify "${BASE_REF}" >/dev/null 2>&1; then
  echo "guardrail: base ref ${BASE_REF} not found; fetching"
  git fetch --no-tags --depth=1 origin "${BASE_REF#origin/}" >/dev/null 2>&1 || true
fi

CHANGED="$(git diff --name-only "${BASE_REF}"...HEAD 2>/dev/null || git diff --name-only "${BASE_REF}" 2>/dev/null || true)"

if [ -z "${CHANGED}" ]; then
  echo "guardrail: no changed files detected vs ${BASE_REF}; passing"
  exit 0
fi

# Protected path patterns (POSIX extended regex, matched against each path).
# Money/middleware terms are SCOPED so they don't false-positive on ordinary UI
# components (e.g. SubscriptionBanner.tsx, PaymentBadge.tsx are presentation, NOT
# logic): money terms match only logic files (.ts/.sql) or a same-named directory,
# and middleware matches only the app/portal edge-session files (apps/*/.../middleware.ts),
# not any stray middleware.ts. The structural dirs below are always protected.
PROTECTED='^supabase/migrations/|^Development/Architecture/migrations/|^scripts/sql/|^scripts/db-.*\.sh$|^packages/authz/|^packages/db/|(^|/)apps/[^/]+/(.*/)?middleware\.ts$|^\.github/workflows/|(^|/)(billing|payments?|stripe|subscriptions?)/|(^|/)[Bb]illing[^/]*\.(ts|sql)$|(^|/)[Pp]ayments?[^/]*\.(ts|sql)$|(^|/)[Ss]tripe[^/]*\.(ts|sql)$|(^|/)[Ss]ubscriptions?[^/]*\.(ts|sql)$'

HITS="$(printf '%s\n' "${CHANGED}" | grep -E "${PROTECTED}" || true)"

if [ -z "${HITS}" ]; then
  echo "guardrail: no protected paths touched; passing"
  exit 0
fi

if [ "${GUARDRAIL_OVERRIDE:-0}" = "1" ]; then
  echo "guardrail: protected paths touched but human-approved override is set; passing"
  printf '%s\n' "${HITS}" | sed 's/^/  approved: /'
  exit 0
fi

echo "::error::Guardrail failed — this PR changes protected paths without the 'human-approved' label."
echo "Protected files changed:"
printf '%s\n' "${HITS}" | sed 's/^/  - /'
echo ""
echo "These areas (schema/auth/RLS/billing/CI) need the owner. See Development/Autonomous/guardrails.md."
echo "If this is intentional and reviewed, the owner adds the 'human-approved' label and re-runs CI."
exit 1
