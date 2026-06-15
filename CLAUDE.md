# CLAUDE.md

Working agreements for agent sessions in this repo.

## Pull requests

- **Always create PRs ready for review — never as drafts.** The owner reviews from the
  GitHub mobile app, which can't review draft PRs. If a PR was opened as a draft by
  mistake, mark it ready immediately.

## Autonomous task routine

An hourly routine picks and builds the "next unblocked task." **Every run is a fresh,
ephemeral clone of `main` with no memory of earlier runs.** The only state shared between
runs is what is committed to `main` plus what GitHub shows (open PRs and `claude/*`
branches). A progress note on a feature branch is invisible to the next run until that PR
merges — so opening a PR is **not** a durable "done" marker; **merging is.**

Before picking a task, every run MUST, in order:

1. Read the §10 session log on `main` to see what has shipped.
2. **List open PRs and `claude/*` branches first.** If one already implements — even
   partially — the task you would pick, do **not** open a parallel copy: review/extend
   that PR, or move to the next unblocked task that no open PR or branch touches. Put the
   task ID (e.g. `G0.1`) in the PR title so this match is exact.
3. Use a task-scoped branch and reuse it on re-runs of the same task — never open a fresh
   random branch for work already in flight.

**Enable auto-merge** so the PR lands on `main` automatically once CI is green and the
owner approves — that, not the open PR, is what lets the next run see the task as done.
Auto-merge is a *"wait for an unmet merge requirement, then merge"* feature, so it only
engages when such a requirement exists. Two things must be true:

1. **Repo + branch protection (owner-only, one-time).** The repo's "Allow auto-merge"
   setting must be on **and** `main` must have a branch-protection rule requiring an
   approving review **plus** the three CI checks (`Lint · typecheck · test · build`,
   `Playwright E2E (app + portal)`, `Migrations · smoke · RLS probe`). The **required
   review is what makes auto-merge usable** — without it, a green PR is immediately
   mergeable (`clean`) and GitHub refuses to arm auto-merge ("merge directly").
2. **Enable it in the right window.** GitHub only accepts the enable call while the PR is
   `blocked` — CI green **and** the required review still pending. It is **refused** while
   checks are still running (`unstable`) and once the PR is `clean`. So the routine MUST:
   - wait for CI to go green, then call enable-auto-merge (not immediately on open, when
     checks are pending — that call always fails);
   - **retry** if it's refused as `unstable` (checks still finishing);
   - if it's refused as `clean`, the **branch-protection required-review rule is missing** —
     do not silently move on; note it in the PR/session log so the owner can add the rule
     (until then PRs need a manual mobile merge and the routine cannot self-land work).

Append the §10 session-log row **after** opening the PR — it is documentation, not the
dedup mechanism; the dedup mechanism is steps 2 + auto-merge.

> Why this section exists: an hourly run with no open-PR check kept re-picking the same
> task from an unchanged `main`, producing **seven** duplicate PRs for one task. The
> "mark progress when you open a PR" rule could not help — the marker lived only on the
> unmerged branch the next run never saw.

## Orientation

- `IMPLEMENTATION_PLAN.md` is the execution roadmap; append a row to its §10 session log
  every working session. The phase task docs under `Development/Architecture/` are the
  canonical task lists; feature behavior lives in `Features/Spec Docs/`; visual spec in
  `Development/Handoff/`.
- `PROVISIONING.md` tracks cloud account setup state (Supabase/Vercel/Sentry).
- Verification gates for every change: `pnpm turbo lint typecheck test build`,
  `pnpm test:db` (dockerized Postgres via `scripts/db-up.sh` + `db-migrate.sh`),
  `pnpm test:e2e`, `scripts/check-migration-drift.sh`. Every user-facing surface change
  ships with an E2E spec (plan §8.6).
- Migrations: `supabase/migrations/` is canonical; `Development/Architecture/migrations/`
  is the documented reference — a schema fix updates **both** (CI drift check enforces).
