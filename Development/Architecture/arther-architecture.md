# Arther — System Architecture

**Version:** 0.1 (draft)
**Date:** 8 June 2026
**Status:** Proposed — greenfield
**Author:** Callum Kelpin (with Claude)
**Companion documents:** [`arther-adrs.md`](./arther-adrs.md) · [`arther-data-model.md`](./arther-data-model.md)

This document proposes the technical architecture for Arther v1: the AI-native technical documentation platform specified across the [PRD](../../Features/PRD/arther-prd.md) and 18 feature specs. It covers topology, components, data flows, the data and AI layers, security and compliance, scaling, and the decisions worth revisiting as the product grows.

It is written for one constraint set above all: **a solo founder building with AI assistance, optimising for low running cost, scalability headroom, regulated-industry rigor, and low maintenance.** Every recommendation is chosen to be runnable by one person on managed infrastructure, while leaving clean seams for the team and scale that come later.

---

## 1. What shapes this architecture

### 1.1 Functional pillars (from the PRD)

Four modules form a sequential pipeline, wrapped by cross-cutting capabilities:

```
 Product Spec Database ──▶ AI Document Generator ──▶ Visual Block Editor ──▶ Publishing Portal
        (graph,                (Claude, typed            (block tree,            (frozen
     versioned truth)           block output)          inline spec tokens)      snapshots, PDF)

 Cross-cutting: Smart Spec Tracking · Collaboration & Review · Content Reuse · Product Variants
                Workspace Admin · Analytics · Onboarding (Ask Arther) · Connectivity
```

### 1.2 Non-functional requirements

| Driver | What it demands of the architecture |
|---|---|
| **Low running cost** | Managed/serverless with generous free tiers; scale-to-zero where possible; no idle clusters; Postgres-native features instead of standalone services until volume justifies them. |
| **Scalability headroom** | Stateless app tier; a read-mostly public portal isolated from the authenticated app; append-only tables that partition cleanly; clear "lift this out" seams (search, analytics, PDF). |
| **Regulated-industry rigor** | Hard tenant isolation (RLS), complete and immutable audit history, encryption in transit and at rest, least-privilege server paths, data-residency optionality, signed DPAs with every subprocessor. |
| **Low maintenance** | One language end-to-end; few moving parts; each concern owned by one managed provider; infrastructure-as-config, not infrastructure-to-operate. |

### 1.3 Invariants the architecture must not violate

The PRD's nine architectural invariants are **load-bearing constraints**, not implementation details:

1. Single source of truth for specs (only the frozen snapshot may copy spec values).
2. Block-first document model with six source tags.
3. Graph model (products ⇄ components many-to-many), not a tree.
4. Two-speed update: structured content auto-updates; prose is flagged.
5. Working copy vs. frozen snapshot separation.
6. Zero-hallucination: every claim traces to a spec field or the Product Brief.
7. Archive-only for entities with dependents.
8. One unified notification system (owned by Collaboration).
9. Single LLM provider (Claude), no abstraction layer.

Plus three enterprise-readiness guardrails to honour from day one: a central `canDo(user, action, resource)` authorisation function, `created_by/at` + `updated_by/at` on every entity, and authentication decoupled from identity (`users` ⇄ `auth_providers`).

These appear throughout as design checks; §12 and the verification appendix confirm the architecture satisfies each.

---

## 2. Recommended stack at a glance

| Layer | Choice | Why (1-line) | ADR |
|---|---|---|---|
| Language | **TypeScript** everywhere | One language for app, portal, jobs; shared types for the block model | [ADR-001](./arther-adrs.md#adr-001) |
| App + Portal framework | **Next.js (App Router)** | The portal *needs* SSR/SEO; same framework serves the editor; zero-ops on Vercel | [ADR-002](./arther-adrs.md#adr-002) |
| Topology | **Modular monolith, two front doors** (app + portal) in a monorepo | Isolation and independent scaling without microservice ops | [ADR-003](./arther-adrs.md#adr-003) |
| Database | **Postgres** (relational + JSONB + FTS + RLS) | Single source of truth handles graph, versions, blocks, search, tenancy | [ADR-004](./arther-adrs.md#adr-004) |
| DB + Auth + Storage platform | **Supabase** | Bundles managed Postgres, GoTrue auth, S3-compatible storage, RLS — one platform for a solo dev | [ADR-005](./arther-adrs.md#adr-005) |
| Background / long jobs | **Trigger.dev** (durable tasks) | Long AI generation + headless-Chrome PDF + fan-out/fan-in + schedules, all managed | [ADR-006](./arther-adrs.md#adr-006) |
| AI | **Anthropic Claude API**, direct, tool-use JSON | Mandated single provider; structured output enforces zero-hallucination | [ADR-007](./arther-adrs.md#adr-007) |
| PDF rendering | **Headless Chrome (Playwright)** inside a Trigger.dev task | Reuses the portal's HTML renderer; one render codebase, two outputs | [ADR-008](./arther-adrs.md#adr-008) |
| Rich-text engine | **TipTap (ProseMirror)** | Atom inline nodes = literally non-editable spec tokens; one JSON tree shared by editor, JSONB, AI contract, renderer | [ADR-013](./arther-adrs.md#adr-013) |
| Portal custom domains | **Vercel Domains API** (wildcard + custom + auto-TLS) | Programmatic CNAME onboarding and certificates with no ops | [ADR-009](./arther-adrs.md#adr-009) |
| Authz + tenancy | **`canDo` in app + RLS in DB** (defence in depth) | Central policy, enforced again at the row | [ADR-010](./arther-adrs.md#adr-010) |
| Email | **Resend** | Transactional invites, magic links, notifications; React Email templates | [ADR-011](./arther-adrs.md#adr-011) |
| Validation | **Zod** schemas | One schema serves API validation, AI tool-use contracts, and block validation | [ADR-012](./arther-adrs.md#adr-012) |
| Errors / monitoring | **Sentry** + provider logs | 10-minute setup, catches the silent failures that sink AI-built apps | — |
| Rate-limit / cache | **Upstash (Redis)** | Serverless rate limiting and ephemeral cache (resolved-spec, sessions); never authoritative | [ADR-014](./arther-adrs.md#adr-014) |
| Monorepo tooling | **pnpm + Turborepo** | Shared packages (`types`, `block-renderer`, `db`, `ui`) across both apps | [ADR-003](./arther-adrs.md#adr-003) |

The whole platform is roughly six managed SaaS dependencies — Supabase, Vercel, Trigger.dev, Anthropic, Resend, Sentry (+ Upstash) — each with a free or low tier, each operable by one person. Alternatives for every choice are recorded in the ADRs.

---

## 3. System topology

```
                          ┌───────────────────────────────────────────────┐
   WORKSPACE USERS        │                  app.arther.io                 │
  (authors, reviewers,    │            Next.js APP (authenticated)         │
   admins, viewers)  ───▶ │  RSC + React editor · server actions/API ·     │
                          │  canDo authz · Zod validation · Realtime sub    │
                          └───────┬───────────────────────┬────────────────┘
                                  │ user JWT (RLS on)      │ enqueue
                                  ▼                        ▼
   ┌───────────────────────────────────────┐   ┌──────────────────────────────────┐
   │              SUPABASE                   │   │           TRIGGER.DEV             │
   │  Postgres (graph, versions, blocks,     │   │  Durable tasks (managed compute) │
   │   JSONB, FTS, RLS) · Auth (GoTrue) ·     │◀─▶│  • doc generation (per section)  │
   │   Storage (media, PDFs) · Realtime       │   │  • variant generate→merge        │
   └───────────────▲─────────────────────────┘   │  • publish: snapshot + PDF        │
                   │ service role               ▲ │  • spec-change propagation        │
                   │ (scoped by workspace_id)   │ │  • notification fan-out / email   │
                   │                            │ │  • import (SpecReconciler)        │
   ┌───────────────┴─────────────────────────┐ │ └──────┬───────────────┬──────────┘
   │           portal.arther.io /             │ │        │ Claude API     │ Playwright
   │            *.arther.io / custom domains   │ │        ▼                ▼  (Chrome)
   │   Next.js PORTAL (SSR + hydration)        │ │  ┌───────────┐   ┌──────────────┐
   │   reads published_snapshots only ·        │ │  │ Anthropic │   │  PDF → Storage│
   │   CDN-cached · sitemap/SEO · magic links  │ │  │  (Claude) │   └──────────────┘
   └───────────────▲─────────────────────────┘ │  └───────────┘
                   │                            │        Resend (email) · Sentry · Upstash
   PORTAL VISITORS │ (anonymous or magic-link)  │
  (customers,  ────┘                            └─ subscribes for live generation/job status
   distributors)
```

Three planes:

- **Authenticated app plane** (`app.arther.io`) — the editor, spec database, dashboard, admin. Every request carries the user's JWT; Postgres RLS is *on* for these connections (defence in depth behind `canDo`).
- **Public portal plane** (`portal.arther.io`, `*.arther.io`, custom domains) — a separate Next.js deployment that only ever reads `published_snapshots` (public-safe, frozen data) via a tightly scoped service path. Isolated so a portal traffic spike or incident cannot touch the authenticated app, and so the public surface has a minimal attack footprint.
- **Async plane** (Trigger.dev) — everything slow, retriable, or fan-out: generation, PDF, propagation, notifications, import. Talks to Postgres with a service role, always scoping by `workspace_id`.

---

## 4. Component architecture

A **modular monolith**: one app codebase, internal modules with explicit boundaries that mirror the PRD's feature buckets. Modules talk through typed service interfaces (not HTTP), so the boundaries are real but the deployment is one unit. Any module can later be promoted to its own service at its existing seam.

| Module | Owns | Key collaborators |
|---|---|---|
| **Identity & Workspace** | users, auth providers, workspaces, members, roles, seats, invitations | every module (tenancy + `canDo`) |
| **Spec Database** | products, components, the graph edges, fields, field versions, releases, units, categories, field comments, import/SpecReconciler | Generator, Tracking, Variants |
| **Document Generator** | Document Types, Product Briefs, Brand Profiles, Quality Standards, generation orchestration, zero-hallucination validation | Spec DB, Editor, AI gateway |
| **Block Editor** | documents, blocks, rich-text model, inline spec tokens, auto-save, optimistic lock, search | Generator, Tracking, Content Reuse |
| **Smart Spec Tracking** | staleness detection, two-speed propagation, domain ownership, dashboard action items, coverage report | Spec DB, Editor, Notifications |
| **Collaboration & Review** | revision state machine, approval roles/records, comments, **the unified notification system** | Editor, Portal, all notifying modules |
| **Content Reuse** | block library, snippets (transclusion), templates, embeds, versioning | Editor, Tracking |
| **Product Variants** | variant defs, deltas, resolved-spec computation + cache, generate-per-variant merge | Spec DB, Generator, Portal |
| **Publishing & Portal** | publish pipeline, frozen snapshots, resolution manifest, PDF orchestration, access/magic links, custom domains, portal SSR | Editor, Collaboration, Storage |
| **Analytics** | event envelope + ingest, portal + workspace events, derived metrics surfaces | Portal, all workspace events |
| **Assistant (Ask Arther)** | read/write tool calls, confirmation gating, context injection, streaming | every module via `canDo` |
| **Platform/Shared** | `canDo`, attribution, audit log, Zod schemas, the shared block renderer, email, storage, feature flags | all |

The **shared block renderer** is the most important shared package: a single TypeScript module that turns a block tree into React. It is consumed by (a) the editor preview, (b) the portal SSR, and (c) the PDF task (printed via `@media print`). One renderer, three targets — this is what makes "the web page is the product, PDF is the fallback" cheap to maintain.

---

## 5. Key data flows

### 5.1 AI document generation (the core loop)

```
Author picks product + Document Type + Brand Profile
        │
        ▼
Pre-flight: app computes populated vs. null spec fields  ──▶ shows what will be real vs. placeholder
        │  (author confirms)
        ▼
App enqueues a Trigger.dev "generate" task (atomic intent)
        │
        ▼   per DocumentTypeSection (slot-filler, section-scoped):
   ┌────────────────────────────────────────────────────────────┐
   │ inject ONLY that section's mapped spec fields + brief        │
   │ fragments + Brand/Quality constraints into a Claude call     │
   │ with a tool-use schema that REQUIRES typed block JSON:       │
   │   - factual values emitted as InlineSpecToken{field_id,      │
   │     field_version_id} — never as free text                   │
   │   - every block carries a source tag                         │
   │ stream tokens → progress persisted per section               │
   └────────────────────────────────────────────────────────────┘
        │  client live-updates via Supabase Realtime (section status)
        ▼
Validation pass: every spec token resolves to a real field version;
                 no factual block lacks a source; schema valid
        │
        ├─ all sections ok ──▶ single transactional write → Draft document + BlockSpecReferences
        ├─ complete failure ─▶ discard, nothing saved, one-click full retry
        └─ partial failure ──▶ save Draft with completed sections + error block(s); section-level retry
```

Why this shape: section-scoped injection keeps each Claude call grounded in one set of facts (lower hallucination risk, lower token cost), the tool-use JSON contract makes structured output the *only* output, and the post-pass turns "zero-hallucination" from a prompt aspiration into a checkable invariant. Generation runs in a durable task because it is long and must survive a serverless timeout.

### 5.2 Spec change → staleness propagation (two-speed)

```
Spec owner edits a field value
   │  (pre-commit: app shows "this will affect N documents / M blocks")
   ▼
Write new FieldVersion (immutable) + advance field.current_version_id  ── single txn
   │
   ▼  emit spec_field_updated → Trigger.dev "propagate" task
   ┌──────────────────────────────────────────────────────────────────────┐
   │ staleness = one indexed join over block_spec_references               │
   │   (field_version_id ≠ current)                                        │
   │ for each affected block:                                              │
   │   • STRUCTURED (spec_table, inline token) → auto-update working copy   │
   │   • PROSE → flag stale; create SectionReviewItem for the DOMAIN OWNER  │
   │       (owner = per-product override ▸ component default ▸ workspace    │
   │        category map ▸ document owner)                                  │
   │   • scalar overrides, snippets, charts → their own review-item types   │
   │ create DashboardActionItems + dispatch notifications (in-app + email)  │
   └──────────────────────────────────────────────────────────────────────┘
   ▼
Published snapshots are untouched (working copy only) until a new revision is published
```

The whole detection step is the single SQL join the Spec DB spec prescribes — O(n) on blocks, no content scanning. Propagation is async only because notification fan-out and structured auto-updates shouldn't block the spec owner's save.

**Bulk changes batch.** A re-import that touches N fields does **not** enqueue N propagate tasks: the import commit emits one `propagate-batch` task per import session, which runs the staleness join once over the whole changed-field set, coalesces review items per (document, section, assignee), and sends each assignee a single digest notification. Single-field edits keep the per-field path above. Without this, a 300-field Excel re-import floods the dashboard and every inbox.

### 5.3 Publish → frozen snapshot + PDF

```
Owner clicks Publish (doc is Approved)
   │  pre-flight: blocking = vacant approval role / placeholder / error block;
   │             advisory = stale blocks, missing alt text (must acknowledge → logged)
   ▼
Resolve: replace every inline spec token with its concrete value, flatten snippets,
         compute ToC — produce ResolvedBlock[] + resolution_manifest
   ▼
Write PublishedSnapshot (immutable, versioned) with pdf_ready = false
   ▼
Trigger.dev "publish-pdf" task: Playwright renders the SAME HTML via @media print → PDF → Storage
   ▼
Set pdf_ready = true  ──▶ ONLY NOW does the document appear on the portal
   │   (PDF job fails ⇒ publish fails, specific error, retry without re-running the whole flow)
   ▼
Revalidate portal CDN cache for the affected paths
```

The snapshot is the one sanctioned copy of spec values (invariant 1, 5). Pre-rendering the PDF means portal download is always a direct file fetch, never an on-demand wait.

### 5.4 Portal request (public + gated)

```
GET {workspace}.arther.io/{product}/{doc}[/vX.Y]   (or custom domain)
   │
   ▼ Portal (Next.js SSR) resolves host → workspace → published snapshot
   ├─ access = public ───────────────▶ render snapshot HTML (CDN-cached) + hydrate interactive blocks
   └─ access = magic link ───────────▶ validate signed, time-limited token (24h)
         │  open link: any email may request · allowlist: email/domain must match
         │  invalid/expired → request-a-link screen
         ▼ render + emit document_viewed (session_id [+ magic_link_id]) async
```

Portal reads only `published_snapshots` and never holds spec or draft data. Frozen + versioned content is highly cacheable, so the portal is cheap at rest and scales with the CDN. Magic links are a lightweight signed-token mechanism, deliberately *not* Supabase Auth accounts — portal visitors are not workspace members.

### 5.5 Variant generation (fan-out / fan-in)

Resolved spec per variant is computed at query time (`base spec + ordered deltas`) and cached in Redis with invalidation on any base-spec or delta change. Generation fans out one durable sub-task per variant (each grounded in a single resolved spec, identical to base generation), then a fan-in merge step waits for all and merges on **spec-linkage** (same `field_id` ⇒ same block, variant-specific value), not text similarity. Unlinked prose that differs becomes a merge review item in the Smart Spec Tracking dashboard. Trigger.dev's `batch + wait` primitive is exactly this pattern.

### 5.6 Offline edit & reconnect

The editor writes changes to a local queue immediately and drains to the server on auto-save. On connectivity loss the editor stays editable, the queue holds edits, and the indicator shows Offline. On reconnect the queue drains in order; if another member edited the same block meanwhile, the user gets a block-level keep-mine / use-server choice. Server-only actions (generate, review, publish, invite) are blocked offline with inline messaging. No CRDT/OT — the PRD rules out real-time co-editing, so block-level resolution is proportionate.

---

## 6. Data architecture

Full schema and ERD: [`arther-data-model.md`](./arther-data-model.md). The shape in brief:

- **One Postgres database, `workspace_id` on every tenant-scoped table.** Tenancy is enforced by RLS policies keyed on workspace membership, and again by `canDo` in the app.
- **Relational for structure, JSONB for documents.** The graph (products, components, `product_components` edges), versions, releases, approvals, and references are relational — they need joins, constraints, and integrity. Polymorphic, schema-flexible payloads live in JSONB: `field_value` (the 8 typed field shapes), block `content` (the rich-text node tree with inline spec tokens), variant `override_value`, snapshot `block_tree`. This is the right seam: query and join on columns, store the irregular interior as JSONB.
- **Immutability where the audit depends on it.** `field_versions`, `approval_records`, `published_snapshots`, `analytics_events`, and `audit_log` are append-only. Field history is never updated or deleted (invariant + regulated rigor).
- **Staleness is a join, by design.** `block_spec_references(field_id, field_version_id, variant_id, …)` indexed so the staleness query (`field_version_id ≠ current_version_id`) is cheap at any document size.
- **Archive-only via FK + state.** Entities with dependents carry `archived_at`; hard delete is permitted only when reference counts are zero (enforced by FK existence checks). This makes accidental destruction structurally impossible (invariant 7).
- **Search starts in Postgres — with explicit extraction.** Rich-text JSONB isn't directly indexable, so search runs over plain-text projections owned by the app: the editor writes `blocks.text_content` on every save (in-app search), and the publish pipeline writes `published_snapshots.search_text` extracted from the resolved block tree (portal search — which queries each document's **latest non-archived snapshot only**, per the analytics spec). Both carry generated `tsvector` columns with GIN indexes; `pg_trgm` covers fuzzy field-name search. No separate search service until volume demands one — then lift to Typesense/Meilisearch behind the same search interface, feeding it from the same extraction hooks.
- **Analytics start in Postgres.** A single append-only `analytics_events` table with the shared envelope; metrics are SQL aggregates. The spec deliberately defers the warehouse; the seam to pipe events into ClickHouse/BigQuery/PostHog later is the envelope itself.

Attribution (guardrail 2), stated precisely: `created_by/at` + `updated_by/at` on every **mutable** entity from the first migration — retrofitting loses history. Append-only tables carry `created`-side attribution only (they never update), and a few tables use domain-specific equivalents (`blocks.last_edited_by`, `overrides.set_by`). Generation runs and import sessions are persisted in Postgres (`generation_runs` / `generation_run_sections` / `import_sessions`) — the Realtime subscription target for live progress, the resume record for partial failure, and the token-cost accounting row.

---

## 7. AI architecture

- **Provider:** Anthropic Claude, called directly (invariant 9). A thin internal `ai-gateway` module centralises the API key, model selection (a backend config, not a user setting), retries, timeouts, and token/cost logging — this is *not* a provider-abstraction layer, just one well-instrumented call site.
- **Structured output, not prose.** Generation uses Claude tool-use with a Zod-derived JSON schema for the block array. Spec values must be emitted as `InlineSpecToken{field_id, field_version_id}` objects, so the model literally cannot type a fabricated number into prose — it can only reference a field. The post-generation validation pass rejects any token that doesn't resolve and any factual block missing a source tag. Zero-hallucination becomes a gate, not a hope.
- **Section-scoped prompts.** Each section receives only its mapped spec fields + brief fragments + brand/quality constraints — lower cost, less cross-section bleed, more grounded.
- **Streaming + durability.** The durable task orchestrates; per-section status and partial output are persisted; the client live-updates via Realtime. Long generations survive serverless limits.
- **Ask Arther** uses the same Claude integration with function-calling tools mapped to internal read/write APIs. Reads return inline cards; **every write returns a proposed action that the user must confirm before it executes** (and runs through `canDo`). At launch the assistant's "how do I…" knowledge is the feature docs stuffed into the system prompt (cheap, simple); a vector store is the scale path if the corpus outgrows the context window.
- **Cost controls (low-cost priority):** concurrency caps on generation, cached/stable Document Type prompt prefixes (prompt caching), token accounting per workspace via the `document_generated` event (the hook for metering later, which v1 deliberately omits).

---

## 8. Background jobs & orchestration

Trigger.dev is the single async system, which keeps the moving-parts count low. It runs tasks on managed compute with long timeouts, durable retries, concurrency controls, scheduling, and fan-out/fan-in:

| Task | Trigger | Notes |
|---|---|---|
| `generate-document` | author action | per-section Claude calls; atomic commit semantics (§5.1) |
| `generate-variants` + `merge` | doc lead action | `batchTriggerAndWait` fan-out, deterministic merge fan-in (§5.5) |
| `publish-pdf` | publish | Playwright/Chrome; gates `pdf_ready` (§5.3) |
| `propagate-spec-change` | field version write | staleness join + review items + notifications (§5.2) |
| `dispatch-notifications` | any notifying event | in-app rows + Resend email per user prefs |
| `import-spec` | file upload | Claude structural interpretation → SpecReconciler diff → confirm → apply; state in `import_sessions`; commit emits ONE `propagate-batch` (§5.2) |
| `review-reminders` | daily cron | scans `document_revisions` in Review past `review_due_date`: reminds pending approvers at due date, escalates to the owner the day after (collab spec) |
| `purge-deleted-workspaces` | daily cron | hard-deletes workspaces past `purge_after` (14-day grace); runs with `session_replication_role = replica` so archive/immutability guards don't block the sanctioned purge |
| `scheduled-sync` *(post-launch)* | cron | same SpecReconciler; External Sync seam |

The SpecReconciler is a shared service the import task wraps today and the (deferred) webhook/scheduled sync wraps later — file vs. webhook differ only in how the payload is normalised before reconciliation.

---

## 9. Publishing & portal infrastructure

- **Separate Next.js deployment** on Vercel, reading only frozen snapshots. SSR for SEO (customers search for datasheets) + hydration for interactive blocks.
- **Custom domains** via the Vercel Domains API: customer points a CNAME at Arther's portal host; Arther adds the domain programmatically and Vercel issues TLS automatically. Wildcard `*.arther.io` covers workspace slugs. Custom domain is canonical (canonical meta tags for SEO). Scale path: Cloudflare for SaaS custom hostnames if domain counts/pricing outgrow Vercel.
- **Caching:** snapshots are immutable, so portal pages are CDN-cached and revalidated on publish (ISR / tag revalidation). This is the cheapest, most scalable shape — a published document is effectively static.
- **PDF:** pre-rendered at publish from the same HTML renderer; stored in Supabase Storage; served as a direct download. Degradation contracts per block type (e.g. accordion → flat sections, video → thumbnail + URL) live in the renderer.
- **Magic links & access logging:** open vs. allowlisted, 24-hour signed sessions, immediate revocation on new requests, every access event logged for the consumption analytics + audit.

---

## 10. Auth, authorization & multi-tenancy

- **Authentication (decoupled — guardrail 3):** Supabase Auth (GoTrue) handles email/password (email verification required) and Google OAuth. `auth.users` is provider identity; `public.users` is the normalised app profile; `auth_providers` links external identities. Adding SAML/OIDC SSO later is an additive provider, not a schema migration.
- **Authorization (`canDo` — guardrail 1):** one function `canDo(user, action, resource)` is the only place permission is decided. At v1 it checks workspace membership + flat role (owner/admin/member/viewer) + document-type approval roles. RBAC/ABAC later changes one module, not the codebase.
- **Tenancy (defence in depth):** every tenant table carries `workspace_id`; RLS policies restrict rows to the caller's workspaces. The authenticated app runs with the user JWT (RLS on). Trusted server paths (jobs, portal) use a service role but **must** scope every query by `workspace_id` — a lint rule and a thin data-access layer enforce this so the service role is never a tenancy bypass.
- **Role-aware writes at the row.** RLS does more than tenancy: write policies require `is_workspace_editor` (owner/admin/member) on content tables, admin role on Settings tables (Document Types, Brand Profiles, units, categories, domain ownership, custom domains), and viewers keep exactly their spec'd writes (comments, approvals). Security-critical tables go further: `published_snapshots` and `generation_runs` accept **no** authenticated inserts at all — only the publish/generation pipelines (service role) create them, so approvals can't be bypassed from a client even if `canDo` regresses.
- **Workspace deletion is soft.** No JWT path can hard-delete a workspace; `request_workspace_deletion()` (owner-only) starts a 14-day grace period during which the workspace is hidden but restorable (`cancel_workspace_deletion()`); the purge job destroys it after. Both transitions are audit-logged.
- **Seats:** seat tier (Editor paid / Viewer free) derives from workspace role; the boundary is enforced through `canDo` **and** mirrored at the row by the editor-write policies above; role-to-seat changes are timestamped (`workspace_members.updated_at/by`) for the post-launch billing UI.
- **Portal visitors** are outside this system entirely — signed magic-link tokens, no accounts.

---

## 11. Security & compliance (regulated-industry rigor)

| Control | Implementation |
|---|---|
| Tenant isolation | RLS on every tenant table + `canDo` + service-role query scoping; tested by logging in as a second workspace and probing (the vibecode RLS test). |
| Audit trail | Attribution on all mutable entities + immutable `field_versions`, `approval_records`, `published_snapshots`, releases, magic-link access logs, and a dedicated `audit_log` for security-sensitive events. Database triggers (not app code) write audit rows for magic-link issuance/revocation and snapshot `access_config`/archive changes, so the audit cannot be skipped. |
| Encryption | TLS everywhere (managed); encryption at rest by default (Supabase/Storage). No spec values or PII in logs. |
| Secrets | Server-side env only (Vercel/Supabase/Trigger.dev); never in client bundles or network responses; rotate anything ever pasted into a tool. |
| Input validation | Zod at every boundary (API, webhooks, AI tool output, import payloads). |
| Rate limiting & abuse | Upstash rate limits on auth, magic-link requests, generation, and public portal endpoints; email verification + bot protection on signup. |
| Least-privilege responses | API returns only needed fields, never raw rows (the common AI-build leak). |
| Data residency / GDPR | Supabase region selection (EU project option for medical-device/EU customers); cookie consent on the portal; defined retention; DPAs with Anthropic, Vercel, Supabase, Resend; PII minimised (public portal = anonymous session IDs only). |
| Backups / recovery | Managed point-in-time recovery on Postgres; Storage versioning; documented restore runbook. |

The [vibecode launch-readiness checklist](../vibecode-best-practices.md) is the pre-launch gate; this architecture is designed to pass it (RLS, JWT, migrations, webhook lifecycle once billing lands, Sentry, paginated/bounded queries, single-handler-per-trigger).

---

## 12. Scalability & reliability

Designed to start tiny and grow without re-platforming. Per layer:

| Layer | Launch | Headroom / scale path |
|---|---|---|
| App tier | Serverless functions (scale-to-zero) | Stateless → horizontal autoscale; connection pooling via Supabase pooler (PgBouncer) is essential for serverless |
| Postgres | Single instance | Read replica → route portal/analytics reads to it; partition `field_versions` & `analytics_events` by time; upgrade tier |
| Search | Postgres FTS (`tsvector`/`pg_trgm`) | Lift to Typesense/Meilisearch behind the search interface |
| Analytics | `analytics_events` table | Pipe envelope to ClickHouse/BigQuery/PostHog |
| Jobs | Trigger.dev managed | Concurrency controls; dedicated queues per task type |
| Portal | Vercel + CDN | Frozen snapshots cache cheaply; Cloudflare for SaaS for custom domains at scale |
| AI | Direct Claude + concurrency caps | Prompt caching; metering hook already emitted |

**Reliability patterns:** all jobs are idempotent and retriable (durable execution); generation and publish have explicit atomic/partial semantics; the working-copy/snapshot split means a failed publish never corrupts live content; resolved-spec and session caches are rebuildable; managed PITR bounds data loss. Failure modes to monitor: Claude latency/limits (queue + caps), PDF/Chrome flakiness (retry + Browserless fallback), and connection exhaustion (pooler).

---

## 13. Cost posture

At dogfood / early scale this runs largely on free and entry tiers: Supabase (free→Pro ~$25/mo), Vercel (Hobby→Pro ~$20/mo), Trigger.dev (free→usage), Resend (free→$20/mo), Sentry (free), Upstash (free→usage). The dominant variable cost is Claude tokens, which the section-scoped prompts, prompt caching, and concurrency caps keep proportionate to real generation volume. There are no idle clusters or always-on workers — everything scales to zero or near it. The single biggest cost lever is the frozen-snapshot portal: published docs are cache-served, so portal traffic is nearly free regardless of volume.

---

## 14. Build sequencing

Aligns with the PRD's phasing; stand up infrastructure just-in-time:

1. **Foundation** — monorepo + Supabase (DB/Auth/Storage) + RLS + `canDo`/attribution/audit scaffolding + Workspace Admin + Spec Database (with import). Stand up: Supabase, Vercel (app), Sentry.
2. **Generation & editing** — AI gateway + Trigger.dev + Document Generator + Block Editor + Smart Spec Tracking. The "spec in → document out" loop. Stand up: Trigger.dev, Anthropic.
3. **Collaboration & publishing** — Review state machine + unified notifications (build early; other features depend on it) + Publishing Portal (separate deploy) + PDF task + custom domains. Stand up: portal deploy, Resend, Vercel Domains, Playwright task.
4. **Advanced** — Content Reuse, Product Variants, Analytics surfaces, Ask Arther.

Cross-cutting (error/lifecycle rules, connectivity queue, enterprise guardrails) are built into each phase, not bolted on.

---

## 15. Risks & what I'd revisit as it grows

- **Two front doors vs. one app.** Recommended for isolation, but it is the one piece of added structure for a solo dev. If early velocity matters more than isolation, ship a single Next.js app with a `/portal` route segment and split later — the shared block renderer makes the split mechanical. *(See [ADR-003](./arther-adrs.md#adr-003).)*
- **RLS + complex queries.** RLS is excellent for isolation but can complicate the heavy graph/staleness queries and forces a disciplined service-role pattern. Revisit if policy complexity starts costing query performance — the fallback is app-enforced tenancy with RLS on the most sensitive tables only.
- **Chrome-in-task for PDF.** Headless Chrome is the fiddliest dependency. If it proves flaky inside Trigger.dev, move to managed Browserless behind the same task interface.
- **Postgres-as-everything.** FTS and analytics in Postgres are right for launch and wrong at scale; the interfaces (search, analytics envelope) are the seams to lift them out — do it on signal (slow queries, zero-result search rate), not speculatively.
- **Single LLM provider.** A deliberate invariant, not a risk to mitigate now. If Claude pricing/availability ever forces a change, treat it as a migration through the single `ai-gateway` call site, not a runtime switch.
- **Realtime for generation progress.** If Supabase Realtime fan-out becomes a bottleneck, fall back to client polling of the persisted per-section status (`generation_run_sections`) — no architectural change.

Five cross-spec tensions worth a deliberate product call as usage grows (from the 9 June architecture audit; none blocks v1):

- **Variant "delta should be small" has no enforcement signal.** The merge machinery handles large deltas anyway; decide when (if ever) the UI should suggest "make this a separate product" — e.g. a threshold on overridden-field share.
- **Brand styling applies at render time to frozen snapshots.** Fine for colours/typography; if a Brand Profile ever encodes *semantics* (value-tier colour coding), old documents silently change meaning. Rule: brand profiles style, never encode meaning.
- **Prose staleness resolves at different granularity in snippets vs documents** (source-level propagating to all embeds vs per-block). Intended — but the dashboard item should say which path produced it so the assignee knows the blast radius of their fix.
- **Domain-owner sign-off vs document-owner publish authority can deadlock** a stale critical document if the owner is unavailable. The owner-override mechanism covers approvals; decide whether admins get an equivalent override for unresolved domain reviews.
- **Placeholder-vs-omit for missing brief fragments is editorial policy.** `brief_required` controls it per section; keep the interpretation uniform across the five built-in Document Types so authors learn one rule.

---

## Appendix A — Invariant compliance check

| Invariant / guardrail | Where satisfied |
|---|---|
| 1 Single source of truth | Postgres is sole store; only `published_snapshots` copy values — and only the publish pipeline can create them (no authenticated INSERT policy) (§5.3, §6, §10) |
| 2 Block-first, six sources | `blocks.source` + reference tables (§4, data model) |
| 3 Graph not tree | `product_components` edges; tree computed at read (§6) |
| 4 Two-speed update | propagation task splits structured vs. prose (§5.2) |
| 5 Working copy vs. snapshot | revisions/working copy; snapshot frozen by trigger, undeletable (no-delete trigger + no policy), unpublish = archive (§5.3, §10) |
| 6 Zero-hallucination | tool-use token contract + validation pass (§5.1, §7) |
| 7 Archive-only | `archived_at` + zero-reference delete guards on components, fields, products (releases/variants), documents (snapshots), library items; workspace deletion is soft + 14-day grace (§6, §10) |
| 8 Unified notifications | owned by Collaboration; all modules dispatch through it (§4, §8) |
| 9 Single LLM provider | direct Claude via one `ai-gateway` (§7) |
| G1 `canDo` | single authz module (§10) |
| G2 Attribution | mandatory on every mutable entity from migration 1; append-only tables carry created-side attribution (§6, §10) |
| G3 Decoupled auth | `users` ⇄ `auth_providers` (§10) |

---

*Arther — System Architecture v0.1. Proposed greenfield architecture for an AI-native technical documentation platform, optimised for a solo founder on managed infrastructure with regulated-industry rigor and scalability headroom. Pairs with the ADR set and the data model / ERD.*
