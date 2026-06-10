# Arther — Phase 2 (Generation & Editing) Build Breakdown

**Date:** 8 June 2026 · **Status:** Proposed · Companions: [`arther-architecture.md`](./arther-architecture.md) · [`arther-data-model.md`](./arther-data-model.md) · [`arther-phase1-tasks.md`](./arther-phase1-tasks.md) · [`migrations/`](./migrations)

Phase 2 builds the core loop the product exists for: **spec in → document out → kept in sync.** It delivers the AI Document Generator, the Visual Block Editor, and Smart Spec Tracking, on top of the Phase 1 foundation. This is where Trigger.dev and the Anthropic API come online ([ADR-006](./arther-adrs.md#adr-006), [ADR-007](./arther-adrs.md#adr-007)).

Same conventions as Phase 1: epics in dependency order (G0 → G8), each task with an outcome, acceptance criteria, and rough sizing (S/M/L). Persistence is in migrations [`0004`](./migrations/0004_generation_brand.sql)–[`0006`](./migrations/0006_smart_spec_tracking.sql).

**Definition of done for Phase 2:** an author selects a product + Document Type + Brand Profile, the AI generates a Draft document grounded in live spec tokens (zero-hallucination validated, atomic), the author edits it in the three-panel block editor with auto-save, and a later spec-field change flags the right prose for the right domain owner on an action dashboard within minutes — published content untouched.

---

## G0 — Generation prerequisites (admin config)

The Document Type *is* the generation schema, so it must exist before anything generates. Implements [`0004_generation_brand.sql`](./migrations/0004_generation_brand.sql).

| # | Task | Outcome | Est |
|---|---|---|---|
| G0.1 | Document Types | CRUD; built-in (forkable, not editable) + workspace types; archive-when-referenced | M |
| G0.2 | Document Type sections | Per-section schema: `spec_field_categories`, `brief_fragment_keys`, `brief_required`, `default_block_types`, quality overrides ([generator spec](../../Features/Spec%20Docs/arther-ai-document-generator.md)) | M |
| G0.3 | Approval roles config | Named roles per type (required/optional) + member assignments (used in Phase 3 review; configured now) | M |
| G0.4 | Brand Profiles | Logo, palette, typography, voice, glossary, unit preference; workspace default; can't delete if referenced | M |
| G0.5 | Quality Standards | Structural/readability constraints, separate from Brand; advisory at review | S |
| G0.6 | Product Briefs | Graph-mirrored briefs (product + component) with named fragments + guidance text; edit surface | L |

**Acceptance:** a workspace type carries an ordered section schema mapping categories→sections; forking a built-in type yields an editable copy while the original stays canonical; a component brief fragment is visible to every product that references the component.

---

## G1 — AI gateway & async runtime

| # | Task | Outcome | Est |
|---|---|---|---|
| G1.1 | `ai-gateway` module | Single Anthropic call site: key handling, model config (backend-only), retries, timeouts, token/cost logging ([ADR-007](./arther-adrs.md#adr-007)) | M |
| G1.2 | Trigger.dev wiring | Durable-task runtime connected to app + DB (service role, workspace-scoped) ([ADR-006](./arther-adrs.md#adr-006)) | M |
| G1.3 | Tool-use schema layer | Zod block schemas → Claude tool-use JSON contract; one source of truth ([ADR-012](./arther-adrs.md#adr-012)) | M |
| G1.4 | Progress streaming | Per-section status persisted in `generation_runs` / `generation_run_sections` (service-role writes; members read); client live-updates via Realtime (poll fallback); token/cost accounting per run | M |

**Acceptance:** a trivial durable task runs end-to-end and survives a function-timeout-length workload; a Claude call returns schema-valid JSON or is rejected; cost/tokens are logged per call.

---

## G2 — AI Document Generator

The deterministic, slot-filler pipeline (not a chat box). Flow detailed in architecture §5.1.

| # | Task | Outcome | Est |
|---|---|---|---|
| G2.1 | Pre-flight completeness | Show populated vs. null spec fields before generation; author confirms | M |
| G2.2 | Section-scoped generation | Per `DocumentTypeSection`: inject only mapped fields + brief fragments + brand/quality; generate that section | L |
| G2.3 | Inline spec tokens | Spec values emitted as `InlineSpecToken{field_id, field_version_id}` objects — never free text | M |
| G2.4 | Source taxonomy | Every block tagged spec/brief/placeholder/structural at generation (manual on later edit) | S |
| G2.5 | Zero-hallucination validation | Post-pass: every token resolves to a real field version; no factual block lacks a source; reject otherwise (invariant 6) | M |
| G2.6 | Atomic / partial / retry | All-or-nothing commit; complete failure discards; partial saves Draft + error blocks; section-level retry | M |
| G2.7 | Placeholder blocks | Null required field → placeholder block (cannot be published); links to the spec/brief to fill | M |
| G2.8 | Generation UX | Live section-by-section status; opens into the editor on completion | M |

**Acceptance:** generation either fully succeeds (Draft created with `block_spec_references`) or saves nothing; no generated factual claim lacks a traceable source; a null required field yields a visible placeholder, not a fabricated value.

---

## G3 — Block model & persistence

Implements [`0005_documents_blocks.sql`](./migrations/0005_documents_blocks.sql).

| # | Task | Outcome | Est |
|---|---|---|---|
| G3.1 | Documents & revisions | `documents` + `document_revisions` (Draft only this phase; state machine column ready for Phase 3) | M |
| G3.2 | Block tree | `blocks` with one-level containers, display order, source tag, degradation config; rich text as JSONB | L |
| G3.3 | Reference tables | `block_spec_references`, `block_brief_references`, `placeholder_brief_references` — the tracking spine | M |
| G3.4 | Archive-guard extension | Extend Phase 1 guards so a field/component can't hard-delete while `block_spec_references` exist | S |

**Acceptance:** a generated document round-trips to/from the DB with its block tree, source tags, and spec references intact; the staleness join returns affected blocks; deleting a referenced field is blocked.

---

## G4 — Visual Block Editor

| # | Task | Outcome | Est |
|---|---|---|---|
| G4.1 | Three-panel shell | Outline · canvas · properties (matches the editor IA already designed) | L |
| G4.2 | 20 block types | Renderers + property editors for all types incl. interactive (accordion, step wizard, hotspot, chart) | L |
| G4.3 | Rich text model | TipTap/ProseMirror document shape ([ADR-013](./arther-adrs.md#adr-013)); spec tokens as atom inline nodes — atomic, non-editable by construction | L |
| G4.4 | Shared block renderer | The `block-renderer` package — one renderer for editor preview, portal SSR, PDF (degradation contracts) | L |
| G4.5 | Edit & preview modes | Edit; Portal preview; PDF preview | M |
| G4.6 | Cross-block ops | Multi-select, drag reorder, bulk delete, copy/paste across docs | M |
| G4.7 | Find/replace & search | Find/replace excluding tokens (ProseMirror decorations); four search scopes (workspace docs, spec values, library, in-doc); editor writes `blocks.text_content` on save — the FTS projection | M |

**Acceptance:** all 20 block types render in editor, portal-preview, and PDF-preview from one renderer; inline spec tokens display current values and can't be partially edited; find/replace never mutates a token.

---

## G5 — Auto-save & connectivity

Implements the [connectivity model](../../Features/Spec%20Docs/arther-connectivity-model.md).

| # | Task | Outcome | Est |
|---|---|---|---|
| G5.1 | Auto-save | Debounced block persistence; advisory optimistic lock with "who's editing" banner | M |
| G5.2 | Local save queue | Edits queue client-side; editor stays editable offline; drains in order on reconnect | M |
| G5.3 | Connectivity indicator | Always-visible Connected / Saving / Offline | S |
| G5.4 | Reconnect conflict | Block-level keep-mine / use-server when another member edited the same block | M |
| G5.5 | Offline-blocked ops | Generation, regenerate, review, publish, invite blocked offline with inline messaging | S |

**Acceptance:** killing the network mid-edit keeps the editor usable and loses nothing on reconnect; a same-block conflict surfaces a block-level choice; blocked ops explain themselves.

---

## G6 — Smart Spec Tracking

Implements [`0006_smart_spec_tracking.sql`](./migrations/0006_smart_spec_tracking.sql). Flow in architecture §5.2.

| # | Task | Outcome | Est |
|---|---|---|---|
| G6.1 | Staleness detection | The indexed join over `block_spec_references` (`field_version_id ≠ current`) | M |
| G6.2 | Two-speed propagation | Trigger.dev task: structured content auto-updates the working copy; prose is flagged, never auto-rewritten (invariant 4) | L |
| G6.2b | Batch propagation | Import commits emit ONE `propagate-batch` per session: single staleness pass, review items coalesced per (document, section, assignee), digest notification per assignee | M |
| G6.3 | Domain ownership | Config + 4-step fallback (per-product override ▸ component default ▸ workspace category map ▸ document owner) | M |
| G6.4 | Review item types | SectionReview, ScalarOverrideReview, SnippetReview, ChartConfigurationFlag generation | M |
| G6.5 | Action dashboard | `dashboard_action_items` grouped by owner; git-merge-style review modal (accept/modify/dismiss) | L |
| G6.6 | Pre-commit impact | On a field save, show "this affects N documents / M blocks" before committing | S |
| G6.7 | Working-copy isolation | Propagation never touches published snapshots (invariant 5) | S |
| G6.8 | Spec coverage report | Per document: referenced vs. available-but-unused spec fields | M |
| G6.9 | Variant-aware scaffold | `variant_id` on references honoured so Phase 4 variants slot in without rework | S |

**Acceptance:** changing a field value auto-updates spec tables/tokens in working copies and creates a `SectionReviewItem` assigned to the correct domain owner; published content is unchanged; the dashboard shows the item with before/after context.

---

## G7 — Regeneration & placeholders

| # | Task | Outcome | Est |
|---|---|---|---|
| G7.1 | Block regeneration | Manual + spec-change-triggered single-block regen via the same section contract | M |
| G7.2 | Placeholder fill offer | Filling a brief fragment offers to auto-generate the blocks waiting on it | M |
| G7.3 | Brief-referenced staleness | Editing a brief fragment puts a *light* staleness indicator on its blocks (distinct from spec urgency) | S |

**Acceptance:** regenerating one block leaves the rest untouched; saving a brief fragment surfaces a count of waiting placeholders and a one-click fill.

---

## G8 — Phase 2 hardening

| # | Task | Outcome | Est |
|---|---|---|---|
| G8.1 | Generation idempotency | Re-runs/retries never double-write blocks; one handler per trigger | M |
| G8.2 | Analytics events | Emit `document_generated`, `block_regenerated`, `spec_field_updated` (the metering/observability hook) | S |
| G8.3 | RLS probe (extended) | Second-workspace probe extended to documents, blocks, references, tracking tables | M |
| G8.4 | Realistic-volume test | Generate/edit a 100+-block manual; confirm editor + staleness queries stay responsive | M |
| G8.5 | Cost guardrails | Generation concurrency caps + prompt caching on stable Document Type prefixes | S |

**Acceptance:** the generation analytics events fire with success/duration; the RLS probe is green for all new tables; a large document is generable and editable within target latencies.

---

## Dependency graph & sequencing

```
G0 ─▶ G1 ─▶ G2 ─▶ G3 ─▶ G4 ─▶ G5
                    └────────▶ G6 ─▶ G7
                                       └─▶ G8 (continuous; Phase-2 exit gate)
```

`G0`→`G1`→`G2`→`G3` is the critical path (you can't edit what you can't generate, and can't generate without the schema and AI runtime). `G4` (editor) and `G6` (tracking) both depend on `G3`'s block model and can progress in parallel once it lands. Milestone order:

1. **M5 — Generate:** G0–G3. Spec + type → a stored Draft block tree.
2. **M6 — Edit:** G4–G5. Refine documents with auto-save and offline safety.
3. **M7 — Keep in sync:** G6–G7. Spec changes flag the right people; regeneration and placeholders close the loop.
4. **M8 — Harden:** finish G8; generate real documentation for a real product (dogfood).

---

## Out of scope for Phase 2 (Phase 3+)

Review/approval transitions and approval records, comments and the unified notification *delivery* (in-app + email) — Smart Spec Tracking surfaces via the dashboard this phase; Publishing Portal, frozen snapshots and PDF; Content Reuse (snippets/templates); Product Variants (scaffolded only); Analytics surfaces; Ask Arther. Their tables arrive in later migrations.

---

*Arther — Phase 2 (Generation & Editing) Build Breakdown v0.1. Nine epics delivering the spec→document→sync loop, exit-gated on a zero-hallucination generation, a full block editor, and correctly-routed staleness. Pairs with migrations 0004–0006.*
