# Provisioning runbook — F0.2 / F0.3 / F0.4

The code side of all three services is wired and **inert until keys exist** (env-gated
factories, DSN-gated Sentry init). This runbook is the account-side remainder. It can be
executed by hand, or by an agent session that has the Supabase / Vercel / Sentry MCP
connectors attached. Closing all three closes milestone **M1**'s infrastructure gate
(IMPLEMENTATION_PLAN.md §4/§6).

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
