# Launch-readiness audit (H.5)

Phase-4 task **H.5** — the v1 exit gate: a full pass of
[`vibecode-best-practices.md`](vibecode-best-practices.md), the AI-assisted-app
pre-launch checklist. Each item is marked ✅ pass / ⚠️ needs attention / ❌ fail /
➖ N/A with evidence. The checklist's required output (Summary / Blockers /
Warnings / Ship it) is at the end.

Most security-critical categories were built and verified across the phases
(security headers F8.3, the full RLS probe H.2, rate limiting F8.2, migrations +
drift, single-handler discipline F8.6, Sentry F0.4); this audit confirms them with
evidence and records the remaining caveats — all **operational/legal owner
actions**, each scheduled — plus the one engineering gap it surfaced and **closed
in this PR** (assistant rate limiting).

## 1. Infrastructure

- ✅ **Dev/prod separated** — two Supabase projects (`arther-dev` /
  `arther-prod`, different regions) and per-app Vercel projects (`PROVISIONING.md`
  §F0.2/§F0.3).
- ✅ **HTTPS / SSL** — Vercel-managed TLS on both apps; HSTS on
  (`@arther/config/security`).
- ✅ **Env vars server-side** — Vercel project env (Preview/Production), never
  hardcoded; typed `loadEnv()` (`packages/config/src/env.ts`).
- ✅ **`.env` ignored** — `.gitignore` ignores `.env`/`.env.*` and tracks only
  `.env.example`; no secrets committed.
- ✅ **Security headers** — F8.3 nonce-`strict-dynamic` CSP + HSTS / `X-Frame-Options:
  DENY` / nosniff / Referrer-Policy / Permissions-Policy / COOP on both apps,
  asserted by E2E header tests.
- ⚠️ **Real domain** — the apps run on `*.vercel.app`; custom domains
  (`app.arther.io` / `portal.arther.io`) are not yet configured. *Scheduled:* add
  via the Vercel Domains API before public launch (architecture §custom-domains).

## 2. Authentication & Security

- ✅ **Token/JWT auth** — Supabase Auth (cookie-managed JWT, PKCE at
  `/auth/callback`), not server sessions (`apps/app/src/middleware.ts`).
- ✅ **Email verification** — email+password **with confirmation required** +
  Google OAuth (`PROVISIONING.md` auth settings; `(auth)/actions.ts` `signUp`
  with `emailRedirectTo`).
- ✅ **Rate limiting** — Upstash sliding windows (in-memory fallback) on every
  abuse-prone surface: `auth`, `invitation`, `import`, `generation`,
  `magic_link_issue`/`_access`, `portal_track` (`@arther/rate-limit`) — **and now
  `assistant`** (this PR) covering `/api/assistant` + `/api/assistant/execute`,
  which were the one unprotected endpoints.
- ✅ **Input validation** — zod `safeParse` at every user-facing boundary (auth,
  specs, assistant request/execute, the PKCE callback's code/next).
- ➖ **Bot protection** — no CAPTCHA/honeypot; signup + magic-link exchange are
  IP-rate-limited instead. Acceptable at invite-driven dogfood; revisit if public
  self-serve signup opens.
- ✅ **No secret/PII logging** — no tokens/passwords/user objects logged; Sentry
  scrubs bodies/headers/cookies, `sendDefaultPii: false`.
- ✅ **OWASP basics** — parameterized access (PostgREST/RPC, no string SQL), CSP +
  output encoding (React) for XSS, RLS + `canDo` for broken-access-control, PKCE +
  relative-only redirect for auth.

## 3. Data leakage & Row-Level Security

> The checklist's most-missed category — and Arther's strongest.

- ✅ **RLS on all tables** — `tests/db/rls-probe-full.test.ts` (H.2): a catalog
  meta-check (every `public` table has RLS; every `workspace_id` table has a
  policy), explicit cross-tenant assertions, and a dynamic sweep proving a second
  workspace's member sees **zero** of the first's rows. 60/60 tables RLS-enabled.
- ✅ **No client-side secrets** — no `'use client'` file reads a non-`NEXT_PUBLIC_`
  env var; only `NEXT_PUBLIC_SENTRY_DSN` (a public ingest key) reaches the browser.
- ✅ **Shaped responses** — routes return projected shapes (NDJSON
  result/proposal/delta; `{results:[{kind,label,ok,href}]}`; lean run-status), not
  raw DB rows.
- ✅ **Credentials never pasted into AI chat** — secrets live only in Vercel env +
  local `.env` (`PROVISIONING.md`); none in the repo or this session.

## 4. Database

- ✅ **All schema via migrations** — `supabase/migrations/` (canonical) mirrored to
  `Development/Architecture/migrations/`, byte-identity enforced by
  `scripts/check-migration-drift.sh` (in sync, 27 files).
- ✅ **Indexes on WHERE/JOIN columns** — extensive per-migration indexing
  (workspace/time, field-version join for staleness, etc.); the G8.4 volume probe
  confirms the staleness join is index-covered.
- ✅ **Migrations run in prod** — all applied to dev + prod, 60 tables verified
  (`PROVISIONING.md` §F0.2).
- ⚠️ **Backups** — Supabase free tier provides daily backups but **not PITR**.
  *Scheduled:* upgrade to Supabase Pro (PITR) before importing real production
  data (`PROVISIONING.md` §F0.2 step 4).

## 5. Payments

- ➖ **N/A** — no payment flow at v1. The billing admin UI is an explicit
  post-launch placeholder (billing spec §1); the seat-data inputs it will need are
  already captured (H.4). No Stripe/webhooks to harden yet.

## 6. Duplicate workflows

- ✅ **Single handler per trigger** — `tests/db/single-handler.test.ts` (F8.6)
  locks exactly one `auth.users` trigger (`handle_new_user`), one
  `workspace_members` trigger, and the two sanctioned membership-insert RPCs; a
  generic probe asserts no duplicate trigger on the same table+event+function.
- ✅ **No near-duplicate logic** — each lifecycle path (signup→`create_workspace`,
  invite→`accept_workspace_invitation`) routes through one RPC; no duplicate
  writers found in `packages/db` or the server actions.

## 7. Error handling & observability

- ✅ **Sentry** — wired in both runtimes (DSN-gated), source-mapped, acceptance
  passed (`PROVISIONING.md` §F0.4).
- ✅ **Friendly external-call failures** — the Claude (`ai-gateway`) call sites
  degrade honestly: generation returns `{error}`/`{status:'failed'}`, the
  assistant streams an NDJSON notice when unprovisioned or throttled — never a
  white screen.
- ✅ **No unbounded inline work at scale** — generation runs inline but
  **sequentially** and is rate-limited (Trigger.dev async runner is the documented
  scale path, V.6); lists use `.limit()` (notifications, runs, imports, portal
  search); the G8.4 volume probe loads a 120-block / 120-reference document.
- ⚠️ **Sentry source maps on Preview** — `SENTRY_AUTH_TOKEN` is Production-only;
  *scheduled:* add to Preview so preview builds get source maps
  (`PROVISIONING.md`).

## 8. User flows

- ✅ **Happy path + edge cases** — 20 E2E specs cover auth/onboarding (`/welcome`
  workspace creation + slug preview), specs/generate/import, the document editor +
  lifecycle + comments, the portal (access gate + search), and settings/analytics;
  the unprovisioned baselines exercise empty/notice states so a no-data first run
  never white-screens.
- ➖ **Mobile** — the app is a desktop authoring tool; the **portal** (the
  public/mobile surface) is responsive frozen-snapshot HTML. No app-side mobile
  layer required at v1.

## 9. Legal & compliance

- ⚠️ **Privacy policy & Terms of Service** — the signup page references "terms of
  service and privacy policy" but the pages don't exist/aren't linked. *Scheduled
  (owner — legal content + review):* publish `/privacy` and `/terms` and link them
  before opening the doors to external users. (Engineering can stand up the routes
  the moment the copy exists.)
- ⚠️ **Cookie consent (GDPR)** — the portal sets one **strictly-necessary** session
  cookie (`arther_portal_access`, `httpOnly`/`secure`/`sameSite=lax`) for the
  access gate; there is no tracking/advertising cookie. A consent banner is likely
  still required for EU visitors. *Scheduled (owner decision + banner) before EU
  go-live.*
- ✅ **Data retention / erasure** — workspace soft-delete + 14-day grace +
  `purge_deleted_workspaces` hard-delete (migration 0016); analytics retention is
  planned at 25 months via partition `DROP` (H.3, `arther-analytics-scale.md`); PII
  minimised (portal visitors are anonymous session ids).
- ✅ **No reckless data handling** — no selling/sharing; `sendDefaultPii: false`;
  EU-region Supabase option documented for EU customers (architecture §security).

---

## Audit output

**Summary.** Arther is launch-ready for dogfood: the security-critical posture —
tenant isolation (full RLS probe), security headers, JWT auth with email
confirmation, rate limiting (now including the assistant), input validation,
secret hygiene, single-handler discipline, Sentry, and no-white-screen error
handling — is in place and tested. The open items are operational/legal owner
actions, each scheduled before opening to external/EU users.

**Blockers (❌).** None. No engineering defect blocks shipping.

**Warnings (⚠️) — scheduled before public / EU launch.**
1. **Privacy & Terms pages** — owner provides legal copy; engineering links
   `/privacy` + `/terms` (referenced from signup today). *Before external users.*
2. **Supabase PITR** — upgrade off the free plan for point-in-time recovery
   *before real production data* (daily backups exist meanwhile).
3. **Cookie consent banner** — decide EU targeting; add a banner for the portal's
   session cookie. *Before EU go-live.*
4. **Custom domains** — move off `*.vercel.app` to `app/portal.arther.io`.
5. **Sentry Preview source maps** — add `SENTRY_AUTH_TOKEN` to Preview.

**Fixed in this PR.** The one engineering gap the audit surfaced — `/api/assistant`
and `/api/assistant/execute` had no rate limit while every other paid/abuse-prone
endpoint did — is closed with a new per-member `assistant` budget (20/min).

**Recommended follow-up prompts.** The active OWASP / leak-scan prompts in the
checklist were exercised by this audit's evidence sweep; no further automated pass
is outstanding.

**Ship it? — YES, WITH CAVEATS.** Ship to dogfood now. The five warnings are
scheduled owner actions gating the move from dogfood → public/EU launch (M16
"dogfood, then open the doors"); none is an engineering blocker.
