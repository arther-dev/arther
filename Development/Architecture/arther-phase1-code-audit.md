# Arther — Phase 1 (Foundation) Code Audit

**Date:** 2 July 2026 · **Status:** Complete · Companion: [`arther-phase1-tasks.md`](./arther-phase1-tasks.md)

Method: five parallel audits over the Phase 1 surfaces (packages `config`/`db`/`authz`/`rate-limit`/`spec-import`/`types`, the app's auth/settings/specs/import surfaces, migrations 0001–0003 + 0012–0016, `tests/db` + `tests/e2e`) — four quality lenses (reuse, simplification, efficiency, altitude) plus a task-by-task conformance check against every F0–F8 acceptance criterion. Quality findings were dedup'd and **fixed in the accompanying PR**; conformance gaps are recorded here as follow-up work, not patched ad hoc.

---

## 1. Conformance vs `arther-phase1-tasks.md`

| Epic | Status | Notes |
|---|---|---|
| F0 Project & infra | **Complete** | Monorepo, Supabase dev+prod, Vercel, Sentry (server/edge/client, PII scrubbed), tiered env loader, 4-job CI. |
| F1 Data foundation | Partial | All conventions/triggers/helpers in place and probed. **Gap: the F1.6 lint rule** (service-role query must carry `workspace_id`) is still the TODO comment in `eslint.config.mjs` — only the runtime guard exists. |
| F2 Auth & identity | Partial | Flows + PKCE + middleware solid. **Gaps:** `auth_providers` is a dead table (no writer anywhere, so the "Google sign-in links an auth_providers row" acceptance is unmet); `handle_new_user()` is INSERT-only (auth.users email changes drift); email verification rests solely on `enable_confirmations = true` — no runtime `email_confirmed_at` check anywhere. |
| F3 Authorization | **Complete** | Single `canDo` authority, closed by default, RLS behind it. The two purity deviations found (inline owner check in the deletion action; role rules re-encoded in ~15 page gates) are **fixed in this PR** via `roleAllows`. |
| F4 Workspace admin | **Complete** | Slug immutability, exactly-one-owner, invite expiry all DB-enforced and probed. Resend delivery is key-gated (copyable link until provisioned). |
| F5 Spec DB core | Partial | 8 types Zod-gated, append-only versions, scalar-only overrides, release guards, cycle check, archive rules — all present and probed. **Gaps:** custom units/categories have schema+RLS but **no create surface**; table fields store whole-value blobs, not the row-level diffs F5.5 promises (the 0012 comment claims otherwise — doc/code contradiction); two acceptance scenarios unprobed (shared-component-two-products history; override-leaves-global-untouched). |
| F6 Spec DB UI | Partial | Three-panel model, tree, all 8 editors incl. Excel paste + chart, override affordances, unified feed. **Acceptance failure: unit conversion is not implemented** — switching a unit re-labels the number without converting (`si_factor` is seeded but never read; admitted in `FieldValueEditor.tsx`'s comment). **RESOLVED 2026-07-02** — registry-backed conversion in `@arther/types/units.ts` (affine via SI base, app-side °C offset, delta rule for absolute tolerances) wired into the editors' unit select. |
| F7 AI import | Partial | Upload→interpret→reconcile→review→commit-as-release all real and probed; additive-by-default holds. **Gaps:** interpretation runs inline in the server action — the "long imports run as a durable job" acceptance (ADR-006's "first use") never happened (`import_sessions.trigger_run_id` is never set); note-row/embedded-unit validation is model-prompted rather than deterministic; no migration/provisioning creates the `spec-imports` bucket. |
| F8 Hardening | Partial | RLS probe in CI, rate limits on all three surfaces, headers/CSP on both apps, Zod at every sampled boundary, single-handler probe, deletion grace + purge cron. **Gap: F8.4** — PITR unenabled (owner-deferred) and no step-by-step restore runbook; the restore acceptance was never exercised. |

**Definition-of-done check:** the tenant-isolation core is genuinely met — signup → workspace → invite → import → edit-with-history → release all work, and isolation is proven by the second-user RLS probe in CI. The gaps cluster in deferred follow-ups, not the integrity core.

### Top gaps, ranked (follow-up work)

1. ~~**F6 — unit conversion on display**~~ **RESOLVED 2026-07-02** (`@arther/types/units.ts` + the editors' unit select; was the only outright acceptance failure on a shipped surface).
2. **F7 — durable job for long imports** (inline AI call in a server action; `maxDuration=300` is the only mitigation).
3. **F2.2 — `auth_providers` never populated**, and `handle_new_user()` never re-mirrors profile changes.
4. **F1.6 — the workspace-id lint rule** was deferred and never landed.
5. **F5.5 — row-level table diffs** don't exist; fix the 0012 comment or ship the diffs.
6. **F5.1 — no create path for custom units/categories** (schema-only feature). Related: the UI/import validate against a hardcoded `CATEGORIES` constant (`specs/shared.tsx`) instead of the seeded per-workspace `spec_categories` table — custom categories can never surface until a `listCategories` read is threaded through the forms and the import validator.
7. **F8.4 — restore runbook + PITR verification** (a Phase-1 exit-gate line).
8. **F2 — email verification is config-only**; a runtime `email_confirmed_at` check would make the guarantee two-layered like everything else.
9. **F5 acceptance-test gaps** — add the shared-component-flags-both-products probe and the override-untouched-global assertion.
10. **E2E is frames-only** for the data-bearing Phase-1 surfaces (deferred to DB probes pending a provisioned E2E env).

---

## 2. Quality findings — fixed in this PR

The four lenses converged on a small set of mechanisms; every fix below keeps behavior identical (except where noted) and is covered by the standard gates.

**Altitude / reuse**

- **`roleAllows(role, action)` extracted from `canDo`** (`packages/authz`). The decision table was being re-encoded inline wherever the role was already in hand — a mutation gate in the deletion action and ~15 page-render gates. All now call the one table; `canDo` = membership lookup + `roleAllows`. Added the `workspace.transfer` action (owner-only) so the transfer-UI gate stops hand-rolling `role === 'owner'`.
- **One `authorizeAction()` preamble** (`apps/app/src/lib/authorize.ts`) replaces the 15-line authorize block that had been copy-pasted into 10 action files (specs, import, settings, snippets ×2, variants, generate, brand-profiles, quality-standards, document-types). It also **drops one DB round trip from every server action**: `getActiveWorkspace` already returns the caller's role, so the second `workspace_members` lookup via `membershipLookupFor` is gone. The `documents/*` action files keep their composite context builders (their membership lookups aren't redundant); unifying them is a reasonable follow-up.
- **`DbRuleError` adopted in `packages/db/workspace.ts`** — six wrappers threw plain `Error`, forcing the app into `e.message.includes('transfer ownership')`-style substring matching (six sites in settings/auth actions). All now use `rpcError()`; callers branch on `instanceof DbRuleError` and surface the DB's author-written message verbatim (the `errors.ts` contract). Behavior note: rule-violation copy now comes from the migrations' `raise exception` text.
- **`acceptInvitation()` wrapper actually used** — the auth action called the RPC raw, bypassing the data-access layer (ADR-010).
- **One `sendEmail()`** (`packages/config/email.ts`) — the invite action and the notification fan-out each had their own Resend fetch with a duplicated default-sender string (ADR-011's "one fetch" had become two).
- **One `unitSymbolFor()`** (`@arther/types`) — the non-obvious "value-embedded unit_id wins over field unit" precedence was implemented three times (grid, override row, history feed).
- **CSP directive table shared** — `buildContentSecurityPolicy` and `buildCacheableCsp` each carried a byte-identical 12-directive table; a future CSP tweak now lands once.

**Simplification / dead code**

- Deleted `packages/authz/seats.ts` (+tests, export) — a full parallel implementation of the billing-critical role→seat rule already in `@arther/types` (`seatTierForRole`/`summarizeSeats`); the authz copy had zero production callers.
- Deleted dead `@arther/types` workspace machinery (`SEAT_TIER_LABELS`, `workspaceSchema`, `workspaceMemberSchema`, `workspaceInvitationSchema` + inferred types) and `getWorkspaceSeatSummary` in `packages/db` — the live row shapes are the db-layer interfaces.
- Deleted `fieldTypeOfRawValue` (spec-import) and `isRateLimitProvisioned` (rate-limit) — exports with no callers outside their own tests.
- Removed the unreachable `isOverridableFieldType` guard inside `OverrideEditor` (its only render site already gates) and flattened the `target` nested ternary on the import review page to `isReimport`.

**Efficiency**

- **Field reorder is no longer N+1**: `moveSpecFieldOrder` issued one sequential UPDATE per sibling (a 20-field category ≈ 22 serial round trips per click). It now updates only rows whose position actually changes (2 in the steady state), in parallel — while still normalizing legacy gapped orders.
- **Invite pre-check narrowed**: `inviteMemberAction` loaded the whole member list (with a users join) to test one email; new `isMemberEmail()` does one `limit 1` query (citext ⇒ case-insensitive).
- **Serial independent awaits → `Promise.all`** in `getNotificationFeed` (runs on every shell render), the specs brief tab, the component-library page (brief + usage; fields + archived fields), the import review page (`recomputePlan` + `listUnits`), `FieldDetail` (field + versions + comments), and the settings page (`auth.getUser` + `getActiveWorkspace`).
- **One service client per save**: `updateFieldValueAction` built three `createServiceClient()` (each re-running the Zod env parse).
- **Memory rate limiter no longer grows unbounded**: idle keys are swept every 1000 checks (the fallback path is the permanent path in dev/CI).
- **Migration 0030** (both trees): `product_releases (workspace_id, created_at desc)` — the one Phase-1 list query (`listReleases`, plus its workspace-scoped RLS predicate) with no matching index; every comparable list already had a `(scope, time desc)` index.

## 3. Findings noted, not fixed (and why)

- **`CATEGORIES` hardcoded vs `spec_categories`** — the right fix is a feature (thread `listCategories` through the field forms, import dropdowns, the Claude prompt, and the `unknown_category` validator), and it changes behavior; filed under conformance gap #6 above.
- **Env loader is only partially the authority** (F0.5) — `packages/db` goes through `loadEnv`, but middleware, `lib/supabase/server`, Resend/Anthropic/Upstash reads go straight to `process.env` (and `RESEND_FROM` isn't in the schema at all). Consolidating is a design decision about presence-gating vs fail-fast; worth its own pass.
- **`documents/*` authorize preambles** — composite context builders where the membership lookup isn't redundant; unify onto `authorizeAction` when next touched.
- **Middleware re-checks `SUPABASE_URL`/`ANON_KEY` inline** instead of `isSupabaseConfigured()` — that helper lives in a `next/headers` module the edge middleware can't import, and middleware needs the raw values anyway. Not a real duplicate.
- **Test-layer duplication** — the workspace/member seed block is hand-rolled across ~28 `tests/db` files (a composed `seedWorkspace()` helper would pay off), and 19 e2e specs re-declare `const APP = 'http://localhost:3000'` instead of Playwright `baseURL`. Mechanical, wide-radius; best done as a dedicated test-hygiene PR.
- **`layout.tsx` awaits the notification feed before rendering children** — halved by the `Promise.all` fix; wrapping the top-bar feed in Suspense is the structural follow-up.

---

*Phase 1 code audit v1.0 — quality fixes applied in the same PR; conformance gaps are the prioritized follow-up list.*
