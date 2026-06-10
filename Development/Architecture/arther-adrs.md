# Arther — Architecture Decision Records

**Date:** 8 June 2026 · **Status of set:** Proposed · Companion to [`arther-architecture.md`](./arther-architecture.md)

Each record states the decision, the context that forced it, the consequences (good and bad), and the alternatives weighed. The constant lens: **solo founder + AI assist, low cost, scalability headroom, regulated rigor, low maintenance.**

---

<a id="adr-001"></a>
## ADR-001 — TypeScript everywhere

**Status:** Proposed

**Context.** Every feature spec defines its data in TypeScript interfaces — the block tree, rich-text nodes, field values, deltas. The editor is unavoidably a rich React app. A solo founder leaning on AI assistance benefits from one language with deep model training coverage.

**Decision.** Use TypeScript across app, portal, and background jobs, with shared types packages.

**Consequences.** (+) The block model is defined once and shared by editor, portal, PDF, and validation — the single most error-prone part of the system gets compile-time safety. (+) One mental model; AI pair-programming is strongest in TS/React. (−) Node's CPU-bound story is weaker than Go/Rust, mitigated by pushing heavy work into managed tasks (§ADR-006).

**Alternatives.** Rails/Django backend + React frontend — high solo productivity, but you lose type-sharing for the block model, run two languages, and still hand-build the React editor. Rejected: the type-sharing win dominates for this product.

---

<a id="adr-002"></a>
## ADR-002 — Next.js (App Router) for both app and portal

**Status:** Proposed

**Context.** The portal is a hard SSR/SEO requirement (customers Google for datasheets) with hydration for interactive blocks. The authenticated app is a rich client. Both render the same block tree.

**Decision.** Build both on Next.js (App Router); deploy on Vercel.

**Consequences.** (+) One framework covers SSR portal *and* interactive app; the shared block renderer works in both. (+) Vercel is zero-ops with built-in CDN, ISR, and the Domains API for custom domains (§ADR-009). (−) Vercel pricing climbs with scale; the portal/app split (§ADR-003) and CDN caching keep it bounded, and Next.js is portable to other hosts if needed.

**Alternatives.** Remix/SvelteKit (capable, smaller ecosystem); separate SPA + a bespoke SSR portal service (two stacks, more ops). Rejected for a solo maintainer.

---

<a id="adr-003"></a>
## ADR-003 — Modular monolith, two front doors, in a monorepo

**Status:** Proposed

**Context.** Microservices are operationally hostile to a solo founder. But the public portal and the authenticated app have different security, scaling, and availability profiles: the portal is anonymous, read-mostly, and must stay isolated from spec/draft data.

**Decision.** One codebase organised as feature modules with explicit internal interfaces, deployed as **two** Next.js apps (authenticated app + public portal) sharing packages (`types`, `block-renderer`, `db`, `ui`) via pnpm + Turborepo.

**Consequences.** (+) Strong isolation (a portal incident or traffic spike can't touch the app; the public surface only reads frozen snapshots) with monolith-level simplicity. (+) Modules can be promoted to services later at existing seams. (−) Two deploy targets and a monorepo are marginally more setup than a single app.

**Alternatives.** Single Next.js app with a `/portal` segment — simpler to start; weaker isolation and shared blast radius. Recommended fallback if early velocity outweighs isolation; the shared renderer makes splitting later mechanical. True microservices — rejected (ops cost).

---

<a id="adr-004"></a>
## ADR-004 — Postgres as the single datastore

**Status:** Proposed

**Context.** The data is a versioned graph (products ⇄ components), with immutable history, JSON-shaped field values and block trees, full-text search needs, and hard multi-tenant isolation. The staleness feature is literally specified as a SQL join.

**Decision.** One Postgres database: relational for structure/joins/constraints, JSONB for irregular payloads, `tsvector` for search, RLS for tenancy.

**Consequences.** (+) One engine covers graph integrity, version immutability, document storage, search, and tenant isolation — fewer systems, lower cost, transactional consistency. (+) Referential integrity makes "archive-only" enforceable. (−) FTS and analytics in Postgres have a ceiling; addressed by leaving lift-out seams (§ADR-004 consequences carried into architecture §12).

**Alternatives.** A graph DB (Neo4j) — the graph is shallow and resolves fine relationally; rejected. A document DB (Mongo) — loses joins/constraints that the audit and staleness model rely on; rejected. Postgres + a separate search service at launch — premature cost/ops; deferred until volume signals.

---

<a id="adr-005"></a>
## ADR-005 — Supabase for Postgres + Auth + Storage + RLS

**Status:** Proposed

**Context.** A solo founder needs database, authentication, file storage, and row-level security without operating four systems. Regulated customers need SOC2-grade providers, RLS, and a path to SSO and EU residency.

**Decision.** Use Supabase as the managed platform: Postgres, GoTrue auth (email/password + Google now, SAML/SSO later), S3-compatible Storage, RLS, Realtime, and a connection pooler.

**Consequences.** (+) One platform collapses four concerns; generous free tier; SOC2; region selection for EU residency; pooler is essential for serverless. (+) GoTrue's `auth.users` vs. app `public.users` is exactly the decoupled-auth pattern the guardrails want. (−) Some vendor coupling; mitigated because it's standard Postgres underneath and Storage is S3-compatible, so exit is migration-not-rewrite.

**Alternatives.** Neon (Postgres only) + Clerk (auth) + S3 (storage) — more best-of-breed, but three vendors and more wiring for one person. RDS/Aurora + Cognito — more control, far more ops. Rejected for maintenance cost.

---

<a id="adr-006"></a>
## ADR-006 — Trigger.dev for durable background and long-running jobs

**Status:** Proposed

**Context.** AI generation runs for tens of seconds to minutes; PDF rendering drives headless Chrome; variant generation needs fan-out/fan-in; spec-change propagation and notifications fan out; import is multi-step. Serverless functions time out and aren't built for long or orchestrated work.

**Decision.** Use Trigger.dev as the single durable task runner — managed compute with long timeouts, retries, concurrency control, scheduling, and `batch + wait` fan-in. It can also run Playwright for PDF (§ADR-008).

**Consequences.** (+) One managed system covers every async workload, including the long ones serverless can't — low ops, scales, observable. (+) Native fan-out/fan-in fits variant generate→merge; scheduling is the future External Sync hook. (−) Another vendor; durable-task programming model has a learning curve (well-documented, AI-assistable).

**Alternatives.** Inngest — excellent event/step orchestration, but long steps run on *your* compute (serverless limits) unless self-hosted; strong second choice if PDF moves to a dedicated service. QStash — simple queue, still needs compute for long tasks. Self-hosted BullMQ + Redis on a worker — cheapest at scale, most ops; rejected for a solo founder at launch.

---

<a id="adr-007"></a>
## ADR-007 — Anthropic Claude, called directly (no provider abstraction)

**Status:** Proposed (ratifies PRD invariant 9)

**Context.** The PRD mandates a single LLM provider and explicitly forbids an abstraction layer at v1. Generation must be structured and zero-hallucination.

**Decision.** Call the Anthropic API directly through one internal `ai-gateway` module (key handling, model selection, retries, timeouts, cost logging) — instrumentation, not abstraction. Use tool-use with a Zod-derived JSON schema so output is a typed block array; spec values are emitted as field references, never free text.

**Consequences.** (+) Optimised for one provider; structured output makes zero-hallucination checkable; one call site to instrument and, if ever needed, migrate. (−) Provider lock-in by design; pricing/availability risk is accepted and contained to one module.

**Alternatives.** A provider-agnostic layer (LangChain-style) — rejected by the PRD; adds complexity for optionality with no v1 value.

---

<a id="adr-008"></a>
## ADR-008 — Headless Chrome (Playwright) for PDF, reusing the portal renderer

**Status:** Proposed

**Context.** Every block must render to an interactive web page *and* degrade to PDF. Maintaining two renderers (e.g. a Typst typesetting path) doubles the work for 20 block types.

**Decision.** Render PDF by printing the portal's own SSR HTML through headless Chrome (Playwright) with `@media print` CSS, inside a Trigger.dev task at publish time; store the file and gate `pdf_ready`.

**Consequences.** (+) One rendering codebase, two outputs; PDF always matches the web; download is a direct fetch (pre-rendered). (−) Chrome is the fiddliest dependency to run reliably.

**Alternatives.** A separate typesetting engine — rejected (two renderers). On-demand PDF generation — rejected (latency when the visitor wants the file). **Fallback:** managed Browserless behind the same task interface if Chrome-in-task proves flaky.

---

<a id="adr-009"></a>
## ADR-009 — Custom domains via Vercel Domains API

**Status:** Proposed

**Context.** Workspaces get `{slug}.arther.io` and can map custom domains (`docs.acme.com`) with automatic TLS, onboarded by a CNAME, programmatically.

**Decision.** Use Vercel wildcard domains for slugs and the Vercel Domains API to add customer domains and provision Let's Encrypt certificates automatically; set canonical tags to the custom domain.

**Consequences.** (+) Zero-ops custom domains and certificates; fits the spec's CNAME flow exactly. (−) Per-domain limits/pricing on Vercel become a factor at high tenant counts.

**Alternatives.** Cloudflare for SaaS (custom hostnames + SSL) — more scalable/cheaper at high domain volume, slightly more setup; the designated scale path. Hand-rolled ACME + reverse proxy — rejected (ops).

---

<a id="adr-010"></a>
## ADR-010 — `canDo` in the app + RLS in the database (defence in depth)

**Status:** Proposed (ratifies guardrail 1 + regulated rigor)

**Context.** Multi-tenant SaaS for regulated customers cannot leak across workspaces. AI-built apps most commonly miss row-level security.

**Decision.** Decide every permission in one `canDo(user, action, resource)` module; additionally enforce tenant isolation with Postgres RLS keyed on workspace membership. The authenticated app runs under the user JWT (RLS active); trusted server paths (jobs, portal) use a service role and **must** scope every query by `workspace_id`, enforced by a thin data-access layer and a lint rule.

**Consequences.** (+) Two independent isolation layers; one place to evolve into RBAC/ABAC; passes the second-user RLS probe. (−) RLS can complicate heavy queries and demands service-role discipline (see architecture §15 revisit note).

**Alternatives.** App-only tenancy (no RLS) — simpler, one missed `where` from a breach; rejected for regulated rigor. RLS-only (no `canDo`) — scatters policy and complicates non-row rules; rejected.

---

<a id="adr-011"></a>
## ADR-011 — Resend for transactional email

**Status:** Proposed

**Context.** The unified notification system delivers invites, magic links, review requests, and event/digest emails. Deliverability and simple templating matter; per-workspace SMTP is an enterprise concern for later.

**Decision.** Use Resend with React Email templates as the single sender at v1.

**Consequences.** (+) Fast setup, good DX/deliverability, templates in the same language/stack. (−) Per-workspace custom SMTP/branding is deferred (acceptable for launch).

**Alternatives.** Postmark (excellent deliverability, fine alternative); SES (cheapest, more setup/templating work). Either is a drop-in behind the notification module's email interface.

---

<a id="adr-012"></a>
## ADR-012 — Zod as the one schema source

**Status:** Proposed

**Context.** The same shapes recur as API request bodies, AI tool-use output contracts, import payloads, and block validation. Divergent definitions are a correctness and audit risk.

**Decision.** Define shapes once in Zod and derive: API validation, the Claude tool-use JSON schema, import normalisation checks, and block-tree validation.

**Consequences.** (+) One source of truth for every boundary; runtime validation everywhere; types inferred for free. (−) Care needed to keep Zod schemas aligned with DB constraints (covered by tests).

**Alternatives.** Hand-written validators / JSON Schema by hand — duplicative and drift-prone; rejected.

---

<a id="adr-013"></a>
## ADR-013 — TipTap (ProseMirror) as the rich-text engine

**Status:** Proposed *(added 9 June 2026 from the architecture audit — the editor engine was the largest undecided dependency, and it determines the `blocks.content` node schema already frozen into the data model and the AI tool-use contract)*

**Context.** The block editor is the product's core surface, and its hardest requirements are rich-text-engine requirements: inline spec tokens that are **atomic** (cursor steps over them, deletes them whole, can never edit inside), find/replace that skips tokens, text-range comment anchors, one-level container nesting, and a JSON document model that round-trips losslessly to the `blocks.content` JSONB column and to the Claude tool-use output schema. There is no real-time co-editing (PRD rules it out), so CRDT-native engines buy nothing.

**Decision.** Use **TipTap 2.x (ProseMirror)**. Inline spec tokens are a custom Node with `atom: true, inline: true` carrying `{field_id, field_version_id}` attrs — ProseMirror atoms are *literally* non-editable interiors, which makes the zero-hallucination token contract a property of the editor, not a convention. One editor instance per text block (Notion-style), all sharing one schema; the stored `blocks.content` node tree **is** the TipTap JSON document shape, validated by the Zod schemas (ADR-012) — no conversion layer in either direction. Find/replace and stale-token highlighting are ProseMirror decorations.

**Consequences.** (+) The stored tree, the editor model, the AI output contract, and the renderer input are one shape. (+) Atoms give exact token semantics for free; mature ecosystem (tables, placeholders, input rules). (−) ProseMirror's transform model has a real learning curve. (−) Per-block instances cost memory on huge documents — mitigated by mounting the full editor only for the active block and rendering inactive blocks read-only.

**Alternatives.** **Lexical** — decorator nodes also model atomic tokens; rejected on JSON-shape stability across versions and a thinner plugin ecosystem for tables/print. **Slate** — schema-less core means hand-enforcing every invariant the schema should own; rejected. **Custom contenteditable** — rejected outright (the graveyard option). Each remains swappable in principle because the persisted format is the Zod-validated tree, but in practice the node shapes lean TipTap — which is exactly why this needed an ADR *before* Phase 2 code.

---

<a id="adr-014"></a>
## ADR-014 — Upstash Redis for rate limiting and ephemeral caches

**Status:** Proposed *(added 9 June 2026 from the architecture audit — Upstash held a correctness-relevant cache with no recorded decision)*

**Context.** Serverless functions need a shared store for rate limiting (auth, magic-link requests, generation enqueue, portal search) and for the resolved-variant-spec cache the variants feature computes at query time. A stale resolved-spec cache would feed wrong values into generation — this cache is correctness-relevant, not just performance.

**Decision.** Use **Upstash Redis** (serverless, per-request pricing) for both. Cache rules: keys are `resolved_spec:{workspace_id}:{product_id}:{variant_id}`; **invalidation is deletion**, performed in the same code path that writes a new `field_version` or mutates a `variant_delta` (the propagate task re-deletes defensively); every entry carries a TTL backstop (24 h) so a missed invalidation degrades to staleness bounded by a day, never forever; a cache miss recomputes from Postgres (base spec + ordered deltas) — Redis is **never** the source of truth and the system is fully correct with Redis down (slower, not wrong). Rate limits use `@upstash/ratelimit` sliding windows.

**Consequences.** (+) Zero-ops, scales to zero, one store for both concerns. (+) The never-authoritative rule keeps the data model's "resolved spec is never a table" invariant honest. (−) Another vendor (the seventh); contained — both uses sit behind small internal modules (`rate-limit`, `resolved-spec-cache`).

**Alternatives.** Vercel KV (same Redis underneath, fewer regions, tighter coupling to one host); Postgres-materialised resolved specs (rejected by the data model — silent-divergence risk); in-memory per-instance cache (useless across serverless instances); no cache (the fallback behavior anyway — adopt if variant counts stay tiny).

---

## Decision summary

| ADR | Decision | Primary driver |
|---|---|---|
| 001 | TypeScript everywhere | shared block model, solo+AI |
| 002 | Next.js app + portal | SSR/SEO + one renderer |
| 003 | Modular monolith, two front doors | isolation without microservice ops |
| 004 | Postgres single datastore | graph + versions + search + tenancy |
| 005 | Supabase platform | DB+Auth+Storage+RLS in one |
| 006 | Trigger.dev durable jobs | long generation + PDF + fan-in |
| 007 | Claude direct, no abstraction | PRD invariant + structured output |
| 008 | Chrome/Playwright PDF | one renderer, two outputs |
| 009 | Vercel custom domains | zero-ops TLS + CNAME flow |
| 010 | `canDo` + RLS | defence-in-depth tenancy |
| 011 | Resend email | low-maintenance transactional mail |
| 012 | Zod one schema | one contract for every boundary |
| 013 | TipTap (ProseMirror) editor engine | atomic spec tokens + one JSON tree everywhere |
| 014 | Upstash Redis cache + rate limit | never-authoritative cache, zero ops |

*Arther ADRs — Proposed set, 8 June 2026 (ADR-013/014 added 9 June 2026 from the architecture audit). Revisit triggers are recorded in the architecture document, §15.*
