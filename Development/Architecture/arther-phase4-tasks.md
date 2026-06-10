# Arther — Phase 4 (Advanced Capabilities) Build Breakdown

**Date:** 8 June 2026 · **Status:** Proposed · Companions: [`arther-architecture.md`](./arther-architecture.md) · [`arther-data-model.md`](./arther-data-model.md) · [`arther-phase3-tasks.md`](./arther-phase3-tasks.md) · [`migrations/`](./migrations)

Phase 4 layers the capabilities that sit on top of the complete lifecycle: Content Reuse, Product Variants, Analytics surfaces, and the Ask Arther assistant / onboarding. It also wires the cross-phase foreign keys left as placeholders and runs the v1 launch-readiness gate.

Epics in dependency order (R → V → A → K → H), each with outcome, acceptance criteria, and rough sizing (S/M/L). Persistence is in migrations [`0009`](./migrations/0009_content_reuse.sql)–[`0011`](./migrations/0011_analytics.sql). The assistant is session-scoped and needs no new tables.

**Definition of done for Phase 4 (and v1):** snippets propagate live to every embedding document; a product family generates and publishes variant-aware documents with a portal variant picker; analytics surfaces show consumption and workspace health; the in-app assistant answers "how do I…" and, with confirmation, performs actions; and the [launch-readiness checklist](../vibecode-best-practices.md) passes.

---

## R — Content Reuse

Implements [`0009_content_reuse.sql`](./migrations/0009_content_reuse.sql). Snippet review items already exist (Phase 2, migration 0006); this phase wires them.

| # | Task | Outcome | Est |
|---|---|---|---|
| R.1 | Block library | Workspace library of reusable block sequences; snippet vs. template | M |
| R.2 | Snippets (transclusion) | Embedding maintains a live link; source edits propagate to all live embeds | L |
| R.3 | Override model | Per-embed state: `live` / `overridden` / `source_changed`; accept-source or keep-override | M |
| R.4 | Versioning & rollback | Each snippet edit creates a version; roll an embed back to a prior version | M |
| R.5 | Deletion protection | Snippets with active embeds can't be deleted, only archived; archiving converts live embeds to static copies | M |
| R.6 | Templates (copy-on-insert) | Inserting a template creates an independent, freely-editable copy (no live link) | S |
| R.7 | Variant-aware snippets | A snippet in a variant-scoped section resolves spec tokens against the variant's resolved spec | M |
| R.8 | Document duplication | Duplicate a doc as a new Draft; snippet embeds keep live links; spec tokens re-link to the new product context | M |
| R.9 | Snippet staleness wiring | A spec change inside a snippet creates a `SnippetReviewItem` for the owner; resolution notifies embedding docs | M |

**Acceptance:** editing a snippet updates every live embed; an overridden embed shows `source_changed` when the source moves and can accept or keep; archiving a snippet with embeds turns them static rather than breaking them; no nested snippets are possible.

---

## V — Product Variants

Implements [`0010_variants.sql`](./migrations/0010_variants.sql) and wires `variant_id` FKs. Flow in architecture §5.5.

| # | Task | Outcome | Est |
|---|---|---|---|
| V.1 | Delta model | Four delta types: SCALAR_OVERRIDE, COMPONENT_SWAP, COMPONENT_REMOVE, COMPONENT_ADD | M |
| V.2 | Resolved-spec computation | Base spec + ordered deltas → resolved spec at query time; cached in Redis with invalidation on base/delta change | L |
| V.3 | Delta editor | Express departures from the base; live resolved-spec preview | M |
| V.4 | Variant-aware blocks | `BlockVariantScope`: ALL / DERIVED (by spec linkage) / MANUAL | M |
| V.5 | Generate-per-variant + merge | Fan-out a generation per variant, then deterministic merge on spec linkage (Trigger.dev batch+wait) | L |
| V.6 | Merge conflict resolution | Two-path: AI-generated conflicts → dashboard review item (non-blocking); human-edited conflicts → side-by-side resolution | M |
| V.7 | Variant-aware staleness | `variant_id` on `block_spec_references` honoured so a base change flags only affected variants | M |
| V.8 | Comparison view | Internal block-level side-by-side across two variants (not portal-facing) | M |
| V.9 | Portal variant experience | Variant picker on the product/landing page + canonical per-variant URLs | M |

**Acceptance:** a variant resolves correctly from base + deltas without its own spec rows; generation produces one variant-aware document where shared blocks merge on spec linkage and only true prose conflicts surface; the portal exposes a picker and canonical variant URLs.

---

## A — Analytics

Implements [`0011_analytics.sql`](./migrations/0011_analytics.sql) (append-only event store; the spec defers the warehouse).

| # | Task | Outcome | Est |
|---|---|---|---|
| A.1 | Event envelope & ingest | Shared `analytics_events` envelope; written async (portal via service role, app/jobs for workspace events) | M |
| A.2 | Portal consumption events | `document_viewed`, `document_downloaded`, `portal_searched` (with `session_id` / `magic_link_id`) | S |
| A.3 | Workspace events | `document_generated`, `document_state_changed`, `block_regenerated`, `spec_field_updated` (some emitted earlier; consolidate) | S |
| A.4 | Visitor identity model | Public = anonymous session; restricted = magic-link recipient identity | S |
| A.5 | Per-document panel | View count, unique visitors, downloads, identified viewers (restricted docs) in the editor sidebar | M |
| A.6 | Admin consumption analytics | Cross-document comparison, top queries, zero-result searches (owner/admin only, via `canDo`) | M |
| A.7 | Admin workspace analytics | Generation success, review cycle times, rejection rates, live stale count (from tracking state) | M |

**Acceptance:** portal and workspace events land in the envelope; the per-document panel reflects real consumption; admin surfaces are owner/admin-gated and compute the spec'd metrics; zero-result searches are visible.

---

## K — Onboarding & Ask Arther

No new tables — the assistant is session-scoped (context resets on logout). Uses the existing `ai-gateway` ([ADR-007](./arther-adrs.md#adr-007)).

| # | Task | Outcome | Est |
|---|---|---|---|
| K.1 | Assistant panel | Opens from top-bar Help / ⌘J; slides in; warm, knowledgeable tone | M |
| K.2 | Context injection | Current module, page, selection, role sent with every message | S |
| K.3 | Streaming responses | Token-by-token into the panel | S |
| K.4 | Read actions | Search/retrieve specs and documents; results as inline cards | M |
| K.5 | Write actions (gated) | Create specs, update fields, navigate — each returns a proposed action requiring confirmation, then runs through `canDo` | L |
| K.6 | Spotlight | Highlight the relevant UI element with a non-blocking overlay when the answer points to one | M |
| K.7 | Knowledge base | Feature docs in the system prompt at launch; vector store only if the corpus outgrows context | S |
| K.8 | Admin first-run checklist | Non-gating setup checklist (Brand Profile, Document Type, invite, first product); collapses when done | M |
| K.9 | Empty states | Consistent one-line description + primary action + one-time assistant nudge across screens | M |

**Acceptance:** the assistant answers contextually and streams; a write action never executes without explicit confirmation and a `canDo` check; spotlight highlights the right element and auto-dismisses; the admin checklist appears only until configuration is complete.

---

## H — Hardening & v1 launch readiness

| # | Task | Outcome | Est |
|---|---|---|---|
| H.1 | Wire deferred FKs | `blocks.snippet_id` + `snippet_review_items.snippet_id` → `library_items`; `block_spec_references.variant_id` + `published_snapshots.variant_id` → `product_variants` (in 0009/0010) | S |
| H.2 | RLS probe (full) | Second-workspace probe across every table created in Phases 1–4 | M |
| H.3 | Analytics scale prep | Monthly partitioning plan for `analytics_events`; lift-out seam to a warehouse documented | S |
| H.4 | Seat tracking | Confirm Editor/Viewer seat counts + role→seat timestamps are recorded for the (deferred) billing UI | S |
| H.5 | Launch-readiness audit | Full pass of [`vibecode-best-practices.md`](../vibecode-best-practices.md): infra, auth, RLS/data leakage, DB, error handling, duplicate workflows, legal | L |
| H.6 | Cost guardrails (full) | Generation concurrency caps + prompt caching; portal cache hit-rate check; confirm no idle always-on compute | S |

**Acceptance:** the full RLS probe is green; the launch-readiness audit returns YES (or YES-with-caveats with each caveat scheduled); seat data is captured; cost posture matches architecture §13.

---

## Dependency graph & sequencing

```
R ─┐
   ├─▶ A ─▶ K ─▶ H (continuous; v1 exit gate)
V ─┘
```

`R` (Content Reuse) and `V` (Variants) both build on the Phase 2 block model and Phase 3 publish pipeline and can proceed in parallel. `A` (Analytics) depends on the portal + workspace events flowing (Phases 2–3). `K` (assistant/onboarding) depends on all features existing to answer about them. `H` is continuous and gates v1. Milestone order:

1. **M13 — Reuse & variants:** R + V. Snippets propagate; variant families generate, merge, and publish.
2. **M14 — Measure:** A. Consumption and workspace analytics surfaces live.
3. **M15 — Guide:** K. In-app assistant and onboarding.
4. **M16 — v1 launch-ready:** H. Full RLS probe + launch-readiness audit; dogfood, then open the doors.

---

## End of the v1 build set

With Phase 4 complete, all 18 feature specs are realised across four phases. Post-launch (architecture §15 and the PRD deferred list): External Sync (SpecReconciler already shared, provenance fields already present), billing admin UI (seat tracking already captured), SSO/SCIM (decoupled auth already in place), DOCX export, and the analytics warehouse lift-out — each pre-wired so it's additive, not a rewrite.

---

*Arther — Phase 4 (Advanced Capabilities) Build Breakdown v0.1. Five epics completing v1: content reuse, variants, analytics, the assistant/onboarding, and the launch-readiness gate. Pairs with migrations 0009–0011 and closes the four-phase build set.*
