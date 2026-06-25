# Guardrails

With **full self-merge on green CI**, CI is the only thing standing between an agent's change and
`main`. These guardrails make that safe by making the dangerous changes *fail CI* unless a human
has explicitly approved them.

## Protected paths

A PR that modifies any of these **fails the `Guardrails` CI check** unless it carries the
`human-approved` label (which only the owner can add):

| Pattern | Why it's protected |
|---------|--------------------|
| `supabase/migrations/**` | Schema changes are irreversible on a live DB and can corrupt tenant data. |
| `Development/Architecture/migrations/**` | Documented migration mirror (drift-checked). |
| `scripts/sql/**`, `scripts/db-*.sh` | Auth shim / migration / seed plumbing. |
| `packages/authz/**` | Authorization & membership logic — a bug here is a security incident. |
| `packages/db/**` | RLS utilities & Supabase client wiring. |
| `**/middleware.ts` | Session/auth enforcement at the edge. |
| `.github/workflows/**` | The CI gate itself — agents must not weaken their own guardrails. |
| Files matching `*billing*`, `*payment*`, `*stripe*`, `*subscription*` | Money. Always human. |

The check is implemented by [`scripts/check-protected-paths.sh`](../../scripts/check-protected-paths.sh)
and wired as the `Guardrails` job in `.github/workflows/ci.yml`. It diffs the PR against its base
branch and fails if any changed file matches a protected pattern without the override label.

## Why a label, not a person

Self-merge means there's no reviewer to say "no" to a risky diff. The label is the owner's
asynchronous "yes": from a phone, the owner adds `human-approved` to a PR they've read, CI
re-runs green, and only then can it merge. Without the label, the guardrail is red and the PR
cannot merge — exactly the desired default-deny.

## Scope policy (what agents may do at all)

Independent of paths, agents are scoped to **bug fixes, UX/visual/a11y polish, and small
single-PR features**. No architectural rewrites, no multi-PR epics, no new external dependencies
without owner sign-off. The PM agent enforces this at approval time; the builder re-checks it
before opening a PR.

## Other standing protections (already in the repo)

- The three required CI checks (lint/type/test/build, E2E, migrations+RLS probe) — never skip.
- Migration drift check (`scripts/check-migration-drift.sh`) keeps canonical + documented
  migrations byte-identical.
- RLS on every table + the second-user RLS probe — cross-tenant leaks fail CI.

## If you need to change a protected path

That's the owner's call. The agent should: relabel the driving issue `needs-human`, write a
precise note in the daily digest's "Needs you" section, and move on. When the owner is back (or
reachable), they review and either add `human-approved` to a prepared PR or make the change
themselves.
