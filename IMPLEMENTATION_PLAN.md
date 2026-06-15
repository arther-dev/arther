# Arther — Implementation Plan

**Date:** 11 June 2026 · **Status:** Active · **Owner:** repo root

This is the execution roadmap for building Arther v1 from the completed specification suite. It synthesizes — and links to, rather than restates — the PRD, the 18 feature specs, the architecture/ADR set, the data model and migrations, the four phase task docs, and the design handoff.

---

## 0. How to use this document

- **This doc** answers: what gets built, in what order, what "done" means per phase, which decisions are pinned, and what is still open.
- **The phase task docs** ([Phase 1](Development/Architecture/arther-phase1-tasks.md) · [Phase 2](Development/Architecture/arther-phase2-tasks.md) · [Phase 3](Development/Architecture/arther-phase3-tasks.md) · [Phase 4](Development/Architecture/arther-phase4-tasks.md)) remain the **canonical task lists** (42 epics, ~213 tasks, with acceptance criteria). This doc does not duplicate them.
- **Feature behavior** lives in [`Features/Spec Docs/`](Features/Spec%20Docs/). **Visual/interaction spec** lives in [`Development/Handoff/`](Development/Handoff/). **Schema** lives in [`supabase/migrations/`](supabase/migrations/) (canonical) with the documented reference copy in [`Development/Architecture/migrations/`](Development/Architecture/migrations/).
- If this doc and a source doc disagree, the source doc wins — fix this doc.
- Every working session appends one line to [§10 Session log](#10-session-log).

## 1. Source-of-truth index

| Doc family | Path | Role |
|---|---|---|
| Product overview | [`Features/PRD/arther-product-overview.md`](Features/PRD/arther-product-overview.md) | Why Arther exists; positioning |
| PRD | [`Features/PRD/arther-prd.md`](Features/PRD/arther-prd.md) | v1 scope; **§8 invariants**; **§9 build order**; deferred list |
| Feature specs (18) | [`Features/Spec Docs/`](Features/Spec%20Docs/) | Authoritative feature behavior |
| Architecture | [`Development/Architecture/arther-architecture.md`](Development/Architecture/arther-architecture.md) | Topology, module map, data flows, cost posture, **§15 revisit triggers** |
| ADRs 001–014 | [`Development/Architecture/arther-adrs.md`](Development/Architecture/arther-adrs.md) | Locked stack decisions + rationale |
| Data model | [`Development/Architecture/arther-data-model.md`](Development/Architecture/arther-data-model.md) | ~60 entities, conventions (RLS, attribution, immutability) |
| Migrations (15) | [`supabase/migrations/`](supabase/migrations/) (canonical) ⇄ [`Development/Architecture/migrations/`](Development/Architecture/migrations/) (reference) | Phase-ordered executable schema (0012 field-value RPC · 0013 releases/overrides · 0014 membership governance · 0015 import commit) |
| Architecture audit | [`Development/Architecture/arther-architecture-audit.md`](Development/Architecture/arther-architecture-audit.md) | 20 findings, all resolved 2026-06-09 |
| Phase tasks (4) | `Development/Architecture/arther-phase{1..4}-tasks.md` | Canonical epics/tasks/acceptance/milestones |
| Design handoff | [`Development/Handoff/`](Development/Handoff/) | DS foundations, app shell, 12 surfaces, a11y wiring |
| Design audits | [`Design/`](Design/) | DS/a11y/QA audits (all remediated as of 2026-06-09) |
| Launch gate | [`Development/Architecture/vibecode-best-practices.md`](Development/Architecture/vibecode-best-practices.md) | Pre-launch checklist (Phase 4 H.5) |

## 2. Locked stack decisions

Per the [ADR decision summary](Development/Architecture/arther-adrs.md#decision-summary): TypeScript everywhere (001) · Next.js App Router for app + portal (002) · modular monolith, two front doors, one monorepo (003) · Postgres as the single datastore (004) · Supabase for DB/Auth/Storage/RLS (005) · Trigger.dev for durable jobs (006) · Claude called directly via one `ai-gateway` call site, no provider abstraction (007) · Playwright/Chrome PDF off the shared renderer (008) · Vercel Domains API for custom domains (009) · `canDo` + RLS defence in depth (010) · Resend email (011) · Zod as the one schema source (012) · TipTap/ProseMirror with atom inline spec tokens (013) · Upstash Redis for rate limits and ephemeral caches (014).

**Build-time pins the ADRs don't cover** (recorded here; revisit triggers noted):

| Pin | Value | Rationale / revisit if |
|---|---|---|
| Node / pnpm | 22 (`.nvmrc`) / pnpm 10 (`packageManager`) | Active LTS; revisit at Node 24 LTS |
| TypeScript | 5.x, `strict: true`, no cross-package path aliases | Workspace deps keep Turborepo graphs honest |
| Next.js / React | latest stable major, pinned in lockfile at scaffold time | Recorded in root `package.json`; revisit per major |
| Tailwind | **v4** (CSS-first `@theme` over v3 `theme.extend`) | Native CSS-variable theming matches the two-tier token system; [Handoff 01 §10](Development/Handoff/01-foundations-design-system.md) intent preserved (one var source) |
| Unit tests | Vitest | Single runner across packages |
| DB tests | `postgres` (postgres.js) against dockerized Postgres 17 | Same probes run in CI service container |
| Lint | ESLint 9 flat config from `packages/config` | `eslint-config-next` layered in apps |
| Monorepo runner | Turborepo 2.x | Per ADR-003 |
| E2E tests | Playwright `~1.56` (`tests/e2e`, chromium) against production builds of both apps | Same engine as the ADR-008 PDF pipeline; every shipped surface gets at least a render/interaction smoke. Pinned to the sandbox's preinstalled chromium-1194 (`PLAYWRIGHT_BROWSERS_PATH`); CI installs its own browsers — bump freely once dev environments can download them |

## 3. Repo layout convention

**Application code lives at the repo root, beside the doc folders. `Design/`, `Development/`, `Features/` stay exactly where they are** — the doc suite is densely cross-linked by relative path; moving it breaks links for zero benefit.

```
apps/app          authenticated workspace (Next.js)        apps/portal      public portal (Next.js)
packages/types    branded IDs, enums, Zod schemas          packages/db      data-access layer (user vs service client)
packages/authz    canDo() + role/seat model                packages/ui      design tokens + DS components
packages/block-renderer  one renderer: editor/portal/PDF   packages/jobs    Trigger.dev tasks (Phase 2+)
packages/ai-gateway  the single Claude call site (ADR-007) packages/spec-import  SpecReconciler + import pipeline
packages/config   env loader, eslint preset                supabase/migrations  canonical executable SQL
scripts/          local DB harness + checks                tests/db         smoke + RLS probes
```

**Migrations canonicality rule:** [`supabase/migrations/`](supabase/migrations/) (timestamp-prefixed, per the [migrations README](Development/Architecture/migrations/README.md)) is what gets applied — locally, in CI, and via `supabase db push` once projects exist. [`Development/Architecture/migrations/`](Development/Architecture/migrations/) is the frozen, documented reference the phase docs link to. `scripts/check-migration-drift.sh` fails CI if they diverge. A genuine schema fix updates **both** and says so in the commit.

## 4. Execution roadmap

Sixteen milestones across four phases. Critical path for v1:

```
F0→F1→F2→F3→F4→F5  →  G0→G1→G2→G3  →  C0→C1→C4→C5→C6  →  H
   (F6, F7 ∥ after F5)   (G4, G6 ∥ after G3)  (C2→C3 ∥, early; C7→C8 after C6)   (R ∥ V; then A; then K)
   F8 continuous gate     G8 continuous gate    C9 continuous gate                  H continuous gate
```

| Milestone | Phase | Epics | Outcome | Exit criteria | Cloud deps activated |
|---|---|---|---|---|---|
| M1 Tenancy spine | 1 | F0–F4 (+F8.1 early) | Sign up, workspace, invite | Second-user RLS probe green | Supabase, Vercel, Sentry |
| M2 Spec graph | 1 | F5, F6.1–6.3 | Hand-edit specs with history | Shared-component history; override semantics | — |
| M3 Import | 1 | F7 | Real spreadsheets in | Real `.xlsx` → correct field graph → release | Anthropic (import), Trigger.dev |
| M4 Harden & dogfood | 1 | F6, F8 | Spec DB dogfooded | [Phase 1 DoD](Development/Architecture/arther-phase1-tasks.md) | Upstash (F8.2) |
| M5 Generate | 2 | G0–G3 | Spec + type → Draft block tree | Zero-hallucination validation rejects unresolvable tokens | Anthropic + Trigger.dev (full) |
| M6 Edit | 2 | G4–G5 | Three-panel editor, auto-save, offline queue | 20 block types, one renderer | — |
| M7 Keep in sync | 2 | G6–G7 | Staleness routed to domain owners | Field change → correct dashboard item, published untouched | — |
| M8 Harden | 2 | G8 | Dogfood generation | [Phase 2 DoD](Development/Architecture/arther-phase2-tasks.md); 100+-block volume test | — |
| M9 Sign-off | 3 | C0–C3 | Review/approve/notify in-app | AND-logic approvals; unified notifications only | Resend |
| M10 Publish | 3 | C4–C6 | Frozen snapshot → PDF → SSR portal | Snapshot immutability probe; PDF ready-gate | Portal deploy (Vercel) |
| M11 Gate & brand | 3 | C7–C8 | Access tiers, magic links, custom domains | Allowlist + revocation behaviors | Vercel Domains API |
| M12 Launch-ready lifecycle | 3 | C9 | Dogfood-published | [Phase 3 DoD](Development/Architecture/arther-phase3-tasks.md); portal-isolation probe | — |
| M13 Reuse & variants | 4 | R ∥ V | Snippets propagate; variant families publish | Live transclusion; delta resolution + merge | — |
| M14 Measure | 4 | A | Analytics surfaces | Events → per-doc panel + admin dashboards | — |
| M15 Guide | 4 | K | Ask Arther + onboarding | Write actions gated by confirmation + `canDo` | — |
| M16 v1 launch-ready | 4 | H | v1 | Full RLS probe; [launch-readiness audit](Development/Architecture/vibecode-best-practices.md) passes | — |

**Sequencing notes** (from PRD §9/§13 and the phase docs): C3 notifications are built early in Phase 3 because Phase 2 staleness alerts and review requests deliver through them (invariant 8). Document Types and Brand Profiles (G0) sit at the Phase 1/2 seam — schedule after the Spec Database ships so it can be dogfooded first. G6.9 and the deferred FKs (H.1) keep variants additive.

## 5. Definition of done per phase

| Phase | DoD (per phase doc) | Proven by |
|---|---|---|
| 1 | Sign up → workspace → invite → import a real Excel sheet into a version-controlled product/component graph → edit with history → named release | RLS probe (F8.1) green in CI; real spreadsheet import; immutability triggers verified |
| 2 | Select product + type + brand → AI generates a grounded Draft (atomic, zero-hallucination) → edit in block editor → spec change flags the right owner in minutes | Generation rejects unresolvable tokens; staleness routes via domain-ownership fallback; published content untouched |
| 3 | Submit → AND-logic approvals → publish → frozen versioned snapshot on a branded SSR portal with PDF; gated docs need a magic link | Snapshot-immutability probe; portal-isolation probe; PDF ready-gate; access logging |
| 4 | Snippets propagate live; variant-aware generate/merge/publish with portal picker; analytics live; assistant answers and acts with confirmation | Full RLS probe across all tables; launch-readiness audit YES |

## 6. Cloud dependency activation schedule

No cloud credentials exist yet. Everything below the "needed at" line is buildable and verifiable locally first — dockerized Postgres 17 + the local auth shim (`scripts/sql/0000_local_auth_shim.sql`), env-gated client factories that throw typed "not provisioned" errors, and mocked gateway interfaces.

| Provider | First needed at | Locally buildable before credentials |
|---|---|---|
| Supabase | F0.2 (M1) | Full schema + RLS + RPCs against docker Postgres via the auth shim; data-access layer; probes |
| Vercel | F0.3 (M1) | Both Next apps build/run locally |
| Sentry | F0.4 (M1) | Config stub, DSN-gated |
| Anthropic | F7.2 (M3), full at G1 (M5) | `ai-gateway` interface + Zod tool-use schemas; mocked in tests |
| Trigger.dev | F7 (M3), full at G1 (M5) | `packages/jobs` task definitions; invoked directly in tests |
| Resend | F4.3 / C3 (M9) | Notification model + dispatch interface; email templates |
| Upstash | F8.2 (M4), G8.5, C9.4 | Rate-limit wrapper interface; in-memory fallback in dev |

## 7. Open build-time questions & recommended resolutions

| # | Question | Source | Recommendation | Decide by |
|---|---|---|---|---|
| 1 | Reviews queue: do Approved/Published docs stay listed? | Handoff 03 §E | Stay listed behind a default `status=needs_action` filter (cheap; preserves audit visibility) | Phase 3 C2 |
| 2 | Settings schema-editor depth (Document Type editor) | Handoff 00/04 | v1 = bounded structural editing (reorder sections, map categories, toggle `brief_required`, rename); built-ins fork-not-edit (matches G0.1/G0.2) | Phase 2 G0 |
| 3 | New Document live-preview fidelity | Handoff 00/03 §C | Reuse `block-renderer` read-only, append per section; fallback = status-stream rows; never pixel-true brand preview at generation time | Phase 2 G2.8 |
| 4 | Panel-toggle keybindings `⌥⌘\` / `⌥⌘⇧\` *(tbc)* | Handoff 02 §6 | Adopt as written (`⌘\` = Focus is settled); revisit on usability evidence | Phase 2 shell |
| 5 | Admin override for unresolved domain reviews | Architecture §15 | v1: none beyond owner approval-override; revisit on observed deadlock | Phase 3 |
| 6 | Tailwind v4 vs v3 | Handoff 01 §10 | **v4** (see §2) — deviation from the doc's literal `theme.extend` wording, intent preserved | ✅ Decided (this plan) |
| 7 | Trigger.dev task location (docs silent) | Architecture §8 | `packages/jobs` (own `trigger.config.ts` in Phase 2; apps import task types only) | ✅ Decided (this plan) |
| 8 | `canDo` module location | Phase 1 F3.1 | `packages/authz` — importable by apps *and* jobs so the single-call-site rule holds | ✅ Decided (this plan) |
| 9 | Local DB strategy | Migrations README | Plain `postgres:17` + minimal auth shim (deterministic, CI-identical); adopt `supabase start` when F0.2 provisions projects | ✅ Decided (this plan) |
| 10 | Light-mode structural token values (not in repo) | Handoff 01 §2 | Ship dark theme; `[data-theme="light"]` stubbed pending Figma Dev Mode variables export | Before Phase 2 editor paper island |
| 11 | uuid v7 PKs | `0001_conventions.sql` | Keep `gen_random_uuid()` v4 (no native v7 in PG17); revisit at PG18 | Deferred |

## 8. Standing verification gates (every PR)

1. `pnpm turbo lint typecheck test build` across all packages and both apps.
2. Migration apply against a `postgres:17` service container (`ON_ERROR_STOP`), auth shim first.
3. DB smoke probes: helpers exist, `create_workspace()` seeds defaults, immutability triggers raise, slug immutable, archive guards block.
4. **Second-user RLS probe** (F8.1, pulled forward from the Phase 1 gate): user B in workspace W2 can neither read nor mutate W1 rows. Extended at G8.3 (Phase 2 tables), C9.1/C9.2 (snapshots/portal), H.2 (all tables).
5. Migration drift check: doc copy ≡ canonical copy.
6. **Playwright E2E suite** (`tests/e2e`) against production builds of `apps/app` and `apps/portal`. Standing rule from M1 on: every feature PR that adds or changes a user-facing surface adds/updates an E2E spec for it (auth flows at F2, spec database UI at F6, import at F7, editor at G4, portal + no-JS readability at C6, …).

## 9. Risk register

| Risk | Mitigation / fallback | Trigger to act |
|---|---|---|
| Chrome-in-Playwright PDF flakiness (architecture §15: "flakiest dependency") | Managed Browserless | Sustained PDF job failures in C5 |
| RLS policy cost on graph/staleness queries | Indexed denormalised `workspace_id`; measured in G8.4 | Volume test misses latency targets |
| Realtime fan-out limits for generation progress | Poll `generation_run_sections` fallback | Realtime instability at M5 |
| Figma ↔ code token drift | Tokens live in one `tokens.css`; re-export from Dev Mode on DS republish | Any DS republish |
| Doc-copy ↔ canonical migration drift | CI drift check (§8.5) | Any red drift check |
| TipTap ↔ React major compatibility | Pin TipTap at G4.3; smoke editor build on framework upgrades | Next/React major bumps |
| Missing light-mode token values | §7.10 — export before Phase 2 editor | Editor paper island work starts |
| Cloud provisioning gap — **infra gate closed 2026-06-11** (F0.2–F0.4 ran for real; F0.4 acceptance source-mapped, ARTHER-APP-3) | Residual: Supabase auth-config confirmation (dashboard) + PITR plan decision; M1 proper still gates on F0–F4 + second-user RLS probe | Real prod data (PITR), F2 auth verification |

## 10. Session log

| Date | Session | Shipped | Deviations |
|---|---|---|---|
| 2026-06-11 | Phase 1 kick-off | This plan; monorepo scaffold (apps/app, apps/portal, 7 packages); canonical migrations + docker Postgres harness + auth shim; smoke + RLS probes; `canDo` + seat model; dark design tokens + starter atoms; Zod env loader; CI | `packages/authz`/`packages/jobs` added beyond F0.1's named list (§7.7–7.8); F1.6 lint rule deferred to follow-up (runtime guard + tests in place); F0.2–F0.4 deferred pending credentials |
| 2026-06-11 | Playwright E2E | `tests/e2e` Playwright suite (chromium, prod builds of both apps via webServer) + CI `e2e` job; standing gate §8.6 — every user-facing surface ships with an E2E smoke | — |
| 2026-06-11 | Cloud wiring (code side) | Sentry SDK in `apps/app` (DSN-gated, PII scrubbed, source-map upload token-gated); `supabase/config.toml` for CLI link/push; per-app `vercel.json` (turbo-ignore); `PROVISIONING.md` runbook for the account-side F0.2–F0.4 | Account-side provisioning pending — Supabase/Vercel/Sentry MCPs not visible in this session (connectors attach at session start); M1 infra gate closes after the runbook is executed |
| 2026-06-11 | Provisioning (PROVISIONING.md executed) | Supabase: `arther-prod` created; all 11 migrations applied to dev + prod, verified (60 tables, RLS 60/60, seeds, RPCs). Sentry: `arther/arther-app` project + DSN. Collected values + status recorded in PROVISIONING.md | Prod region us-west-1 (connector doesn't offer dev's us-west-2). Manual remainder per PROVISIONING.md status: Vercel repo import ×2 + env vars (connector has no create/env tools), Supabase auth config + service-role keys, Sentry auth token; PITR needs paid plan. M1 stays open until F0 acceptance on a real URL |
| 2026-06-11 | F5.4 groundwork + app shell | FieldValue union for all 8 spec field types in `@arther/types` (Zod, ADR-012: one source for editors/AI contracts/import) + §3.5 override rules; app-shell skeleton per Handoff 02 — TopBar/LocalRail/AppShell in `@arther/ui`, `/dashboard` + `/specs` routes with the region matrix, home → `/dashboard`, token sheet → `/design-tokens`; 6 new E2E shell specs | Shell is the static frame: tab system, ⌘K palette, navigator/inspector behavior land with F6/G4; placeholder glyphs pending the DS icon export |
| 2026-06-11 | F2 auth (code side) | Auth surfaces per the auth IA — `/login` `/signup`(+`/verify`) `/forgot` `/reset/{token}` `/welcome` `/invite/{token}` as a branded card outside the shell; `@supabase/ssr` middleware (session refresh + routing) and server actions (logIn/signUp/logOut/reset/createWorkspace via the 0003 RPC/Google OAuth), Zod-validated, all env-gated with typed not-provisioned degradation; `TextField` DS atom with the label/aria-describedby contract; `slugifyWorkspaceName` + live portal-slug preview; 7 E2E auth specs | Full auth flows verifiable end-to-end once the manual provisioning items land (Supabase auth config + env vars); invite acceptance renders the honest dead-end until F4.3; Profile/account-menu surfaces follow with Settings (F4.5) |
| 2026-06-11 | F5/F6 first slice | Migration **0012** `update_spec_field_value()` (atomic version append + pointer move, invoker-rights RLS; both copies + README) with 5 DB probes; `@arther/db` spec repository (workspace/products/fields/units/versions, Zod-gated writes, `membershipLookupFor` canDo wiring); `formatFieldValue` + `wouldCreateReferenceCycle` (F5.9) in `@arther/types`; `/specs` UI — product navigator + creation, categorized field grid, add-field (all 8 types), inline scalar editor; canDo-gated server actions | Data-bearing UI E2E needs provisioned env (unprovisioned baseline preserved); remaining F6 editors (range/toleranced/enum/multi_enum/table/reference), components/graph UI, releases, overrides, version feed = next slices |
| 2026-06-11 | F5/F6 second slice | Per-type inline editors for the full scalar family (range/toleranced/boolean/enum/multi_enum; enum options defined at field creation per §4.6); **Component Library** at `/specs/library` (F5.2) with create + per-component field grids + "used in N products" badges; product↔component **graph edges** (F5.3) — attach-with-quantity, component sections on the product view with shared-component affordances (F6.4 start); rail views are real links now | Table editor (mini-spreadsheet, F6.3 L) and reference picker still pending; releases (F5.7), overrides (F5.6), version/comment feed (F6.5) next; component nesting (parent_component_id) deferred with tree rendering |
| 2026-06-11 | M1 infra verification + turbo env fix | Verified manual provisioning: Vercel `arther-app`+`arther-portal` live with env vars (F0.3 done), `SENTRY_AUTH_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` set. F0.4 acceptance run 1 reached Sentry (ARTHER-APP-1/2) with **unmapped** frames; root-caused from Vercel build logs (turbo strict env stripped undeclared `SENTRY_*`/`SUPABASE_*` from `app#build`; pnpm blocked `@sentry/cli` postinstall) and fixed: `turbo.json` build `env`+`passThroughEnv`, `@sentry/cli` in `onlyBuiltDependencies` (PR #10). Run 2 on the PR preview: build logged `Successfully uploaded source maps` ×3, probe → **ARTHER-APP-3 source-mapped** (`page.tsx:16 SentryCheck`) — **F0.2–F0.4 infra gate closed**; HTTPS app URL verified (auth-gated). CI green ×4 on PR | M1 proper still gates on F0–F4 + second-user RLS probe (needs Supabase auth config — dashboard-only, unverifiable via connector). PITR still blocked on free plan |
| 2026-06-11 | F5/F6 third slice — releases + overrides | Migration **0013** (both copies): `create_product_release()` RPC — atomic snapshot pinning the current version of every valued product + attached-component field (invoker rights); release **delete** policy + guard (0003 shipped no delete path; spec §3.8 wins — blocked only while `block_spec_references.release_id` lineage exists); type-change guard while overrides exist (§3.5); override integrity guard (scalar family only, field must belong to the edge's component). Repo: release list/create/delete, override list/set/clear (Zod-gated). UI: Releases section on the product page (create + confirm-delete), `/specs/releases` rail view wired, **Edit (global) vs Override (this product)** affordances on shared-component rows with override chip + global value (F6.4). 14 DB probes, 3 new E2E specs (22/22 green; shell spec updated — Releases rail item is a link now) | "Which products hold overrides" surface arrives with the type-change UI (none exists yet; the 0013 guard holds the invariant meanwhile); release detail (pinned-value list) deferred; table/reference editors remain the next F6.3 slice |
| 2026-06-12 | F6.3 complete — table + reference editors | **Table mini-spreadsheet** (spec §5.5): column mapping (name/role/unit per column, schema roles enforced client-side then by Zod), numeric rows, **Excel/CSV paste** via pure `parseTablePaste` in `@arther/types` (TSV/CSV, header detection, NBSP normalization; 5 unit tests), interpolation select, **live chart preview** through new `SpecChart` in `@arther/ui` (pure SVG, structural props — the Phase 2 Chart block renders through the same primitive). **Reference picker**: select over the Component Library (self excluded), value renders as a navigable `→ name` link; **F5.9 cycle check at save** — `listReferenceEdges` (component-owned reference fields) + `wouldCreateReferenceCycle` in the action, own edge excluded on re-point; added the missing reference-graph unit tests (5). `SpecFieldRow` now carries `component_id`/`product_id` | All 8 field editors now live. Data-bearing editor E2E still pending the provisioned-E2E environment (unit + DB-probe coverage meanwhile); searchable combobox + side-panel reference preview and drag-to-reorder are F6.1-polish items; series promotion UX (§5.5 #2) approximated by per-column role selects |
| 2026-06-12 | F5/F6 closed — comments, feed, detail panel, archive, nesting | **F5.8 field comments**: composer + repo (`addFieldComment` captures `field_version_id` + `value_snapshot` server-side at insert — "at this comment" can never drift); commenting routed through canDo **`comment.write`** (viewer right; `authorize()` parameterized). **F6.5 unified feed**: value changes + comments interleaved chronologically with author attribution (`listUsersByIds`) and per-comment value context. **F6.1 detail panel**: `?field=` server-rendered `FieldDetail` on `/specs` and `/specs/library` — field names link in; header shows type/category/archived + current value. **F5.10 archive UI**: `setArchived` for products/components/fields + restore disclosures (archived products on the product page, archived components + per-component archived fields in the library); hard delete stays DB-guarded, no UI. **F6.2 nesting**: attach gains "Nest under" (edge-under-edge `parent_component_id`), components render as a recursive tree. 5 new DB probes (viewer-can-comment RLS, version-context persistence, threading, stranger isolation, archive editor-gating) | Phase 1 F5/F6 epics now closed except: drag-to-reorder (display_order edit UI), comment threading UI (schema + probe ready; composer is flat), searchable reference combobox + side-panel preview — all F6-polish, parked for the dogfood pass (M4). Provisioned-data editor E2E still pending the env |
| 2026-06-12 | F2 closure + F4 workspace admin | **F2.3 PKCE callback** `/auth/callback` (code exchange → `next`; middleware allows `/auth`; signup/recovery/OAuth all route through it — links dead-ended before); `APP_URL` in env schema + Vercel (owner set A+B+C: email-confirm on, Google OAuth, site URL — PROVISIONING updated). Migration **0015→0014** (both copies): owner-rules trigger (**exactly one owner**; closes the 0002 gap where admins could mint `role='owner'`), atomic `transfer_workspace_ownership()` (definer, GUC-scoped trigger bypass), `get/accept_workspace_invitation()` definer RPCs (invitee is RLS-blind pre-membership). **F4.2/F4.4/F4.5**: `/settings` — rename, immutable-slug display, members table (role select / remove / transfer with confirm), role-aware rendering; account menu (Settings + Log out) behind the TopBar avatar. **F4.3**: invitations live end-to-end — create (+copyable 7-day link), revoke, `/invite/[token]` accept page; Resend delivery is one env-gated fetch that activates with `RESEND_API_KEY`. 8 DB probes; settings/account-menu E2E; shell spec: Account control is a labeled `<summary>` now | M1's remaining proof is human: signup → email confirm → `/welcome` → workspace on the real URL (owner test). Logo upload (Storage) + Danger Zone surface → F8.7; login `next`-return after invite → polish. 0014 to apply to cloud dev+prod post-merge |
| 2026-06-12 | Fix: auth redirects derive from request host | Prod Google sign-in bounced to /login: GoTrue logs showed `/callback`→`user_signedup`/`login` (200/302) but the app never saw `/auth/callback` — the browser landed on `/` then `/login`, i.e. GoTrue **rejected `redirect_to` and fell back to the Site URL**. Root cause: redirects built from a single static `APP_URL` (wrong/absent on prod, and structurally wrong for per-deploy preview hosts). Fix: `appOrigin()` reads `x-forwarded-host`/`-proto` so OAuth `redirectTo` + email-confirm/recovery `emailRedirectTo` + invite links target the exact host (APP_URL kept only as non-request fallback); new-but-workspaceless users (first Google sign-in) now redirect `/dashboard`→`/welcome`. Email "not received" was a red herring — `user_repeated_signup`: the Google sign-up had already created callumkelpin@gmail.com, so the email signup sent nothing (anti-enumeration). Gates 29/29, E2E 25/25 | Belt-and-suspenders still owner-side: confirm prod redirect allowlist carries the `https://arther-app.vercel.app/**` wildcard. Built-in Supabase SMTP is rate-limited — custom SMTP (Resend) is the production path (rides the same key as F4.3) |
| 2026-06-12 | M1 sign-in spine verified LIVE | Google OAuth end-to-end on production after the redirect fix + the `https://arther-app.vercel.app/**` allowlist entry (owner added). Evidence: Vercel runtime logs show `GET /auth/callback 307` (was `GET /`→`/login` pre-fix); prod DB confirms the full chain — first sign-in → `/welcome` → `create_workspace` (0003 RPC) produced workspace **SPAN** with the user as **owner** (atomic membership + seeded defaults). Pre-fix orphaned auth record cleared. Sign-up → workspace = **M1 core acceptance, proven on real infra** | Invite-by-**email** loop is the last M1 "invite" gate — needs Resend (the link flow works today; Supabase built-in SMTP is unreliable). Then F7 import (Anthropic + Trigger.dev). F8.1 RLS probe has been green in CI throughout |
| 2026-06-15 | F8.2 — rate limiting | `rateLimit()` wrapper in `@arther/config` (fixed-window; **in-memory by default**, **Upstash REST pipeline** — INCR + PEXPIRE NX, one fetch/no SDK per the Resend ethos — when `UPSTASH_REDIS_REST_*` present; **fails open** on backend error since it's defence-in-depth over canDo+RLS, ADR-014/§6). App `checkRateLimit`/`clientIp` helper with per-bucket rules (tunable in one place) wired into **auth** (signin/signup/reset/oauth/invite-accept, keyed by IP), **invitation** create (settings, keyed by user — caps the Resend spam-relay path), and **import** upload+retry (keyed by user — bounds Anthropic spend). 6 unit tests (limit/isolation/window-reset/fail-open/Upstash pipeline shape); gates `pnpm turbo lint typecheck test build` 35/35 | No new user-facing surface → no E2E (the limiter is invisible until tripped, and auth surfaces early-return not-provisioned in the unprovisioned E2E env); logic covered by unit tests. `UPSTASH_REDIS_REST_*` still owner-side (PROVISIONING/§6) — the in-memory fallback covers dev/single-instance until then. Remaining F8: F8.3 security headers, F8.5 input-validation sweep, F8.6 single-handler audit, F8.7 Danger Zone; F8.4 PITR blocked on a paid plan |
| 2026-06-12 | F7 — AI-powered import (M3, code-complete) | **`@arther/spec-import`** — the SpecReconciler shared service (§6.4): xlsx/csv parse (exceljs + own RFC-4180 CSV), zod/v4 interpretation contract (raw units as written; tables as source ranges — numbers come from the file, never the model), unit normalisation w/ conservative alias fold (mV≠MV), additive-by-default reconcile (✓/~/+/− plan, stable keys), decisions layer (skip/rename/re-unit/re-categorise), F7.5 warnings (unrecognised unit → null value + reading preserved in conditions, duplicates disambiguated, value-not-in-source grounding check); 21 unit tests. **`@arther/ai-gateway`** — the one Claude call site (ADR-007/invariant 9): structured outputs via `zodOutputFormat`, adaptive thinking, streaming, token logging, env-gated typed errors; 5 tests. Migration **0015** `commit_import_session()` (atomic plan apply via 0012/0013 + auto-release "Imported from {file}"; both copies + README rows for 0013–0015); 6 DB probes (atomicity, nesting, rollback-on-failure, double-commit guard, viewer/stranger isolation). App: `/specs/import` full-canvas stepper (upload → structural review → field review → validation → diff-first commit), re-import entry on the product page + empty-state link, recent-sessions list, honest not-provisioned/failed states w/ retry-from-storage; 4 E2E specs (29/29 green). Cloud: 0015 applied to dev+prod; `spec-imports` Storage bucket + workspace-scoped policies (editor upload/member read) on dev+prod via MCP | F7 acceptance ("real spreadsheet → correct field graph") needs **ANTHROPIC_API_KEY** in Vercel (owner step, PROVISIONING.md) — flow degrades honestly until then. Durable-job wrapper (ADR-006) deferred to G1: interpretation runs in the server action (`maxDuration` 300). zod **v4** confined to the AI-contract schemas (SDK helper requirement); repo stays on classic v3. Type corrections in review deferred (type conflicts surface read-only; edit in Specs post-import); templates (§6.1/6.3) are not in the F7 epic. New packages beyond §3's original list recorded in §3 |
