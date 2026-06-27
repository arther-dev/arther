# Provisioning runbook — F0.2 / F0.3 / F0.4

The code side of all three services is wired and **inert until keys exist** (env-gated
factories, DSN-gated Sentry init). This runbook is the account-side remainder. It can be
executed by hand, or by an agent session that has the Supabase / Vercel / Sentry MCP
connectors attached. Closing all three closes milestone **M1**'s infrastructure gate
(IMPLEMENTATION_PLAN.md §4/§6).

## ⚠️ Status — 2026-06-25 (provisioning audit; variants epic V.1–V.9 shipped)

The code is feature-complete through the Product Variants epic, but a connector audit found
the remote databases are **behind the repo's migrations** and several runtime keys are unset.
Action items, highest-impact first:

1. **CRITICAL — apply migrations 0016–0029 to dev + prod.** Both projects' schemas sit cleanly
   at **0015** (`import_commit`); migrations 0016–0029 were never applied. Missing from both:
   generation-commit (0018), **the entire publish pipeline `publish_document` (0021)**, approvals
   (0019/0020), fork-document-type (0017), consumption/health analytics (0024–0027), variant
   publishing (0028), and merge conflicts (0029). The deployed apps will fail on publish,
   variants, and generation-commit until this is fixed. Both DBs are effectively empty (prod: 2
   test workspaces, 0 documents/products/snapshots; dev: empty), so a clean re-migrate is safe.
   **Wrinkle:** the prod/dev `schema_migrations` tracking uses different timestamps
   (`20260611…`) than the repo's canonical files (`20260608…`), so `supabase db push` won't
   reconcile cleanly — prefer **`supabase link --project-ref <ref>` + `supabase db reset --linked`**
   per project (re-applies 0001–0029 from the repo, resyncs tracking; safe given no real data),
   or apply 0016–0029 directly via the MCP connector.
2. **Trigger.dev task deploy** (V.5/V.6): set `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, **and `SUPABASE_ANON_KEY`** in the Trigger.dev *project* env
   (the typed env loader validates all three Supabase vars, so the ANON key is required even
   though the task only uses the service key), then `pnpm --filter @arther/jobs deploy`. Vercel's
   `TRIGGER_SECRET_KEY` only lets the app *enqueue* — the worker runs on Trigger.dev's compute.
3. **`ANTHROPIC_API_KEY`** in Vercel `arther-app` (Preview + Production) — gates all AI
   (generation, import, assistant, variants). Confirm it's on both environments.
4. **`RESEND_API_KEY`** (+ verified domain) in Vercel — email (invites, review reminders,
   notifications) is wired but sends nothing without it. **`CRON_SECRET`** in Vercel — the
   review-reminders cron returns 503 without it.
5. **`workspace-logos`** public Storage bucket (dev + prod) — public read + workspace-editor
   write on the `{workspace_id}/` prefix (mirror the `spec-imports` policies). Until then the
   Settings logo upload degrades.
6. **Before real traffic:** `UPSTASH_REDIS_REST_URL`/`_TOKEN` (durable rate limiting; in-memory
   fallback is per-instance), and the portal secrets `PORTAL_SESSION_SECRET` (magic-link access)
   + `PORTAL_REVALIDATE_SECRET`/`PORTAL_REVALIDATE_URL` (instant on-publish cache bust).
7. **PITR — now UNBLOCKED (Supabase Pro).** No longer plan-blocked; just enable Point-in-Time
   Recovery on the prod project (Database → Backups) before importing real data. (Supersedes the
   "Blocked on plan" note in §F0.2 step 4 below.)
8. **Launch gate (before external/EU users):** publish/link `/privacy` + `/terms` (routes now
   scaffolded — swap in legal copy), `SENTRY_AUTH_TOKEN` on Vercel Preview, a cookie-consent
   banner (EU decision), and custom domains off `*.vercel.app`.

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
- **F0.4 acceptance: PASSED (2026-06-11, second run).** First run (`/sentry-check?go=1`
  on production) reached Sentry (ARTHER-APP-1/2) but with **minified frames**: Turborepo
  strict env mode stripped the undeclared `SENTRY_*`/`SUPABASE_*` vars from `app#build`
  (`[@sentry/nextjs] No auth token provided. Will not upload source maps`), and pnpm
  blocked the `@sentry/cli` install script. Fixed in repo (`turbo.json` build
  `env`/`passThroughEnv` + `@sentry/cli` in `pnpm.onlyBuiltDependencies`, PR #10); the
  PR's preview build then logged `Successfully uploaded source maps` ×3 (node/edge/client)
  and the re-fired probe produced **ARTHER-APP-3 with fully source-mapped frames**
  (`page.tsx:16:11 (SentryCheck)` + source context). Production gets source maps on the
  first deploy that includes the fix. Preview also serves the app over HTTPS on a real
  URL (auth middleware gates `/design-tokens` → login card, HSTS on) — F0.3 step 3 ✓.
- **Auth settings (step 3): done 2026-06-12 (owner-confirmed, dashboards).** Both
  projects: email+password with confirmation required, Google OAuth (one Google
  client; both `…supabase.co/auth/v1/callback` URIs registered), Site URL +
  redirect allowlist → `https://arther-app.vercel.app` (+ localhost + preview
  wildcard), `APP_URL` set in Vercel (Preview + Production). App-side PKCE
  callback (`/auth/callback`) ships with the F2/F4 PR — links dead-ended
  before it.

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
- ☒ Acceptance test (step 4): **passed 2026-06-11** — ARTHER-APP-3 on the PR #10
  preview deploy, source-mapped frames (`page.tsx:16:11 (SentryCheck)`). First attempt
  was unmapped (turbo strict env — fixed in repo, see status update above).

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

## F7 / M3 — AI import activation (Anthropic)

Code side shipped 2026-06-12 (F7 PR): `@arther/ai-gateway` (the single Claude call
site, ADR-007), the `@arther/spec-import` pipeline, migration 0015, and the
`/specs/import` flow. Status:

- ☒ Migration **0015** (`commit_import_session`) applied to dev + prod via MCP (2026-06-12).
- ☒ Storage: **`spec-imports`** bucket (private, 15 MB limit) + workspace-scoped policies
  (editor upload / member read on the `{workspace_id}/{session_id}/{file}` prefix)
  created on dev + prod via MCP (2026-06-12). No update/delete policies — uploads are
  the import audit trail.
- ☐ **Manual:** `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys) → Vercel
  `arther-app` env (Preview + Production; server-side only) + local `.env`. Until it
  exists the import flow degrades honestly ("AI interpretation isn't provisioned yet")
  and keeps the upload for retry.
- Model selection is backend config (architecture §7): `ai-gateway` defaults to
  `claude-opus-4-8`.
- Trigger.dev (ADR-006 durable import job) stays deferred to G1: interpretation runs
  synchronously in the upload server action (`maxDuration = 300`). Wrap the same
  pipeline in a `packages/jobs` task when Trigger.dev is provisioned.

## F4.5 — Workspace logo (Storage)

Code side shipped 2026-06-16 (G-batch): owner/admin upload at `/settings`, stored
as the workspace's `logo_url`. Status:

- ☐ **Manual:** create a **public** Storage bucket named **`workspace-logos`** on dev
  + prod (Supabase dashboard → Storage, "Public bucket"), with an editor/admin-write
  policy on the `{workspace_id}/…` prefix and public read. Until it exists the upload
  degrades honestly ("the 'workspace-logos' storage bucket may not exist yet") — no
  crash, and the rest of Settings is unaffected. Public-read so the stored
  `getPublicUrl` renders the logo without a signed URL.

## After provisioning

- Fill local `.env` from `.env.example` (local dev talks to `arther-dev`).
- Run the F0 acceptance: `pnpm build` green, authed page on a real URL over HTTPS,
  a thrown error visible in Sentry, CI green and required.
- Tick the M1 row in IMPLEMENTATION_PLAN.md §10 and drop the "deferred pending
  credentials" caveat.
