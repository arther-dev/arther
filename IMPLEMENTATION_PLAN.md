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
| Migrations (11) | [`supabase/migrations/`](supabase/migrations/) (canonical) ⇄ [`Development/Architecture/migrations/`](Development/Architecture/migrations/) (reference) | Phase-ordered executable schema |
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
| Cloud provisioning gap (no credentials yet) | §6 local-first rule; M1 stays open until F0.2–F0.4 run for real | Credentials become available |

## 10. Session log

| Date | Session | Shipped | Deviations |
|---|---|---|---|
| 2026-06-11 | Phase 1 kick-off | This plan; monorepo scaffold (apps/app, apps/portal, 7 packages); canonical migrations + docker Postgres harness + auth shim; smoke + RLS probes; `canDo` + seat model; dark design tokens + starter atoms; Zod env loader; CI | `packages/authz`/`packages/jobs` added beyond F0.1's named list (§7.7–7.8); F1.6 lint rule deferred to follow-up (runtime guard + tests in place); F0.2–F0.4 deferred pending credentials |
| 2026-06-11 | Playwright E2E | `tests/e2e` Playwright suite (chromium, prod builds of both apps via webServer) + CI `e2e` job; standing gate §8.6 — every user-facing surface ships with an E2E smoke | — |
