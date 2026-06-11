# supabase/

## migrations/ — canonical executable schema

Timestamp-prefixed copies of the 11 phase-ordered migrations. **This directory is
what gets applied** — locally (`pnpm db:migrate`), in CI, and via `supabase db push`
once Supabase projects are provisioned (Phase 1 F0.2).

The original files in [`Development/Architecture/migrations/`](../Development/Architecture/migrations/)
remain the **documented reference** the phase docs and data model link to.

**Drift rule:** the two copies must stay byte-identical (ignoring the timestamp
prefix). `scripts/check-migration-drift.sh` enforces this in CI. A genuine schema
fix updates **both** copies and says so in the commit message.

## Local development without a Supabase project

Plain `postgres:17` in Docker stands in for Supabase until F0.2
(IMPLEMENTATION_PLAN.md §7.9). Because migrations 0002/0003 depend on GoTrue's
`auth` schema (`auth.users`, `auth.uid()`, the `anon`/`authenticated`/`service_role`
roles), `scripts/sql/0000_local_auth_shim.sql` recreates that minimal surface with
Supabase-compatible definitions.

**The shim is LOCAL/CI ONLY. It must never be applied to a real Supabase project**
(GoTrue owns the `auth` schema there).

```sh
pnpm db:up        # start postgres:17 on port 54329
pnpm db:migrate   # apply shim + migrations in order (ON_ERROR_STOP)
pnpm test:db      # smoke probes + the second-user RLS probe (F8.1)
pnpm db:down      # stop and remove the container
```
