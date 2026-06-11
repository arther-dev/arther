# CLAUDE.md

Working agreements for agent sessions in this repo.

## Pull requests

- **Always create PRs ready for review — never as drafts.** The owner reviews from the
  GitHub mobile app, which can't review draft PRs. If a PR was opened as a draft by
  mistake, mark it ready immediately.

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
