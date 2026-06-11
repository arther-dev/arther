# Provisioning runbook — F0.2 / F0.3 / F0.4

The code side of all three services is wired and **inert until keys exist** (env-gated
factories, DSN-gated Sentry init). This runbook is the account-side remainder. It can be
executed by hand, or by an agent session that has the Supabase / Vercel / Sentry MCP
connectors attached. Closing all three closes milestone **M1**'s infrastructure gate
(IMPLEMENTATION_PLAN.md §4/§6).

## Status — executed 2026-06-11 (agent session, MCP connectors)

Everything reachable through the Supabase / Sentry connectors is done; the rest needs
dashboard access. Values below are **public-tier** (anon/publishable keys are RLS-guarded
client keys; the DSN is a public ingest key). Secrets are never written to this repo.

### Update — 2026-06-11 (verification session, after manual dashboard work)

- **F0.3 Vercel: done.** Both projects exist on team `Arther` (renamed from “Arther's
  projects”, same `team_T6BMoZyEWNHn7Iw1CELDGh3R`): `arther-app`
  (`prj_fCxwQATb2Q7FIdepAj1FfMSc0Wu9`, production deploy READY at
  `arther-app.vercel.app`) and `arther-portal`. Env vars confirmed present on the
  project (build log lists all of `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY`,
  `SENTRY_DSN/ORG/PROJECT/AUTH_TOKEN`) — which also closes the two “Manual” secret
  items below. Note: `SENTRY_AUTH_TOKEN` is **Production-only**; add it (+ORG/PROJECT)
  to Preview per step 2 so preview builds get source maps too.
- **F0.4 acceptance: fired, found a build bug, fix landed.** `/sentry-check?go=1` on
  the production deploy reached Sentry (ARTHER-APP-1 server-side, ARTHER-APP-2 client
  digest error) — but with **minified frames**: Turborepo strict env mode stripped the
  undeclared `SENTRY_*`/`SUPABASE_*` vars from `app#build` (`[@sentry/nextjs] No auth
  token provided. Will not upload source maps`), and pnpm blocked the `@sentry/cli`
  install script. Fixed in repo: `turbo.json` build `env`/`passThroughEnv` +
  `@sentry/cli` in `pnpm.onlyBuiltDependencies`. **Re-run the acceptance after the
  next production deploy** and confirm source-mapped frames before ticking M1.
- **Auth settings (step 3): still unverified** — not readable via connector and
  `*.supabase.co` is outside this session's network allowlist; confirm in the
  dashboard (email confirmation on, Google OAuth, site URL = Vercel app URL).

**F0.2 Supabase — done (except auth config + service keys):**

| | dev | prod |
|---|---|---|
| Project ref | `ncarijtpzriupskfriot` | `uobovmuggodidiqrsqss` |
| `SUPABASE_URL` | `https://ncarijtpzriupskfriot.supabase.co` | `https://uobovmuggodidiqrsqss.supabase.co` |
| Region | us-west-2 (pre-existing) | us-west-1 (us-west-2 not offered via connector; same US jurisdiction) |
| Schema | all 11 migrations applied; verified 60 tables, RLS on 60/60, seeds + RPCs | same, identical counts |

- `SUPABASE_ANON_KEY` (legacy) and the modern publishable key are retrievable from the
  dashboard (Project Settings → API Keys) or via MCP `get_publishable_keys`; dev publishable:
  `sb_publishable_r77jBVfZtza3EZ9DNXMtTg_JXh2IA0D`, prod publishable:
  `sb_publishable_K0zsgmzdDhD9RXKGhD9kOQ_PS6yD6cj`.
- ☒ **Manual:** `SUPABASE_SERVICE_ROLE_KEY` per project (dashboard → API Keys; secret —
  `.env`/Vercel only). *Done — present in Vercel env (2026-06-11 update).*
- ☐ **Manual:** Auth settings per project (step 3): email+password with confirmation, Google OAuth, site URL.
- ☐ **Blocked on plan:** PITR/backups (step 4) — org is on the **free** plan; PITR requires a paid plan. Decide before real prod data.

**F0.3 Vercel — done (2026-06-11 update):** the two-project repo import (per-app Root
Directory + env vars) was done by hand in the Vercel dashboard — the connector exposes
no project-creation or env-var tools. Team: “Arther” (formerly “Arther's projects”,
`team_T6BMoZyEWNHn7Iw1CELDGh3R`).

**F0.4 Sentry — done (except auth token):** project `arther/arther-app` created
(platform `javascript-nextjs`, team `arther`).

- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`:
  `https://14850d72b17273e6952325e82272067d@o4511544438226944.ingest.us.sentry.io/4511544541249536`
- `SENTRY_ORG=arther` · `SENTRY_PROJECT=arther-app`
- ☒ **Manual:** `SENTRY_AUTH_TOKEN` (step 3) — org settings → Auth Tokens; secret, Vercel
  env only. *Done — set on Production (2026-06-11 update); add to Preview too.*
- ☐ Acceptance test (step 4): fired 2026-06-11 — events arrived but frames unmapped
  (turbo strict env, fixed in repo); **re-run after the next production deploy**.

## F0.2 — Supabase

Two projects, **dev and prod separate** (vibecode gate: prod DB never shared with dev).

1. Create projects `arther-dev` and `arther-prod`; pick one region for both (data residency).
2. Apply the schema to each — either `supabase link --project-ref <ref> && supabase db push`
   (the CLI reads `supabase/config.toml` + `supabase/migrations/`), or run the 11 migrations
   in order via the SQL editor / MCP `apply_migration`. **Do not apply
   `scripts/sql/0000_local_auth_shim.sql`** — it is for plain Postgres only; GoTrue owns
   `auth` on Supabase.
3. Auth settings: enable email+password **with email confirmation required**, add Google
   OAuth (F2.1); set the site URL to the Vercel app URL once it exists.
4. Confirm PITR/backups are on (F8.4) for prod.
5. Collect per project: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## F0.3 — Vercel

Two projects from this repo (monorepo: set **Root Directory** per project):

| Project | Root directory | Domains (later) |
|---|---|---|
| `arther-app` | `apps/app` | app.arther.io |
| `arther-portal` | `apps/portal` | portal.arther.io + wildcard (Phase 3 C8) |

1. Import the GitHub repo twice (once per root directory). Vercel auto-detects Next.js +
   pnpm; `vercel.json` in each app adds `turbo-ignore` so unaffected apps skip builds.
2. Environment variables (**server-side only**, per F0.3/F0.5; set on Preview + Production):
   - `arther-app`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     (dev project values on Preview, prod values on Production), `SENTRY_DSN`,
     `NEXT_PUBLIC_SENTRY_DSN`, and `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`
     for source-map upload.
   - `arther-portal`: nothing yet (stub until Phase 3 C6).
3. Verify a preview deploy serves the token page over HTTPS (F0 acceptance).

## F0.4 — Sentry

Code is already wired in `apps/app` (`instrumentation.ts`, `instrumentation-client.ts`,
`sentry.{server,edge}.config.ts`, `withSentryConfig` source maps; PII scrubbing on:
`sendDefaultPii: false`, cookies/bodies stripped server-side, no replays).

1. Create a Sentry project (platform: Next.js), e.g. `arther-app`.
2. Copy the DSN into `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (Vercel env + local `.env`).
3. Create an auth token with `project:releases` + source-map upload scope →
   `SENTRY_AUTH_TOKEN`, plus `SENTRY_ORG` / `SENTRY_PROJECT` (Vercel env only).
4. Acceptance: throw a test error on a deployed preview and confirm it appears in Sentry
   with readable (source-mapped) stack frames. The portal app gets the same wiring at
   Phase 3 C6.

## After provisioning

- Fill local `.env` from `.env.example` (local dev talks to `arther-dev`).
- Run the F0 acceptance: `pnpm build` green, authed page on a real URL over HTTPS,
  a thrown error visible in Sentry, CI green and required.
- Tick the M1 row in IMPLEMENTATION_PLAN.md §10 and drop the "deferred pending
  credentials" caveat.
