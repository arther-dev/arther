# Arther.io — Product Synthesis (Second Pass)

**Purpose:** Holistic review of all feature specifications against the product overview, identifying conflicts, gaps, open questions, and architectural issues that must be resolved before the official PRD is written. This is the second pass — following resolution of all critical and high-severity findings from the first synthesis.

**Documents reviewed:**

| # | Document | Version | Change from first pass |
|---|----------|---------|----------------------|
| 0 | Arther Product Overview | — | Unchanged |
| 1 | Feature Index | — | Unchanged (still stale) |
| 2 | Spec Database Architecture | v1.4 | Updated — variant-aware BlockSpecReference, provenance fields for External Sync |
| 3 | AI Document Generator | v1.2 | Updated — all blocking questions resolved |
| 4 | Visual Block Editor | v1.2 | Updated — headless Chrome, DOCX removed, Code Block + Callout added, search added, comment anchoring resolved, undo/redo resolved |
| 5 | Smart Spec Tracking | v1.2 | Updated — variant-aware staleness, notification delegation to Feature 6 |
| 6 | Publishing Portal & Export | v1.2 | Updated — Tabs removed, Code Block + Callout added, block count updated |
| 7 | Collaboration & Review | v1.1 | Updated — sub-block text-range anchoring, orphaning on text edits, unified notification system |
| 8 | Content Reuse (Block Library) | v1.1 | Updated — notification events delegated to Feature 6, snippet–variant interaction resolved |
| 9 | Product Variants | v1.1 | Updated — variant-aware snippet behaviour resolved |
| 10 | External Sync | v1.1 | Updated — deferred post-launch, adapter strategy and launch list resolved |
| 11 | Enterprise Readiness | — | Unchanged (guardrails only) |
| 12 | Analytics Event Model | v1.0 | **NEW** |
| 13 | Onboarding | v1.0 | **NEW** |
| 14 | Error Handling Matrix | v1.0 | **NEW** |
| 15 | Billing & Pricing | v1.0 | **NEW** |
| 16 | Workspace Admin | v1.0 | **NEW** |
| 17 | Connectivity Model | v1.0 | **NEW** |

---

## 1 — Architectural Overview: How the Feature Buckets Fit Together

Arther's architecture is a pipeline with four core modules (Spec Database → AI Document Generator → Visual Block Editor → Publishing Portal) and six cross-cutting systems that enrich and constrain behaviour across those modules, plus six supporting specifications that define operational and administrative concerns.

### 1.1 The Core Pipeline

```
┌─────────────────┐     ┌──────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│  Spec Database   │────▶│  AI Document Generator│────▶│  Visual Block Editor│────▶│  Publishing Portal  │
│  (Feature 1)     │     │  (Feature 2)          │     │  (Feature 3)        │     │  (Feature 5)        │
│                  │     │                       │     │                     │     │                     │
│  Graph model     │     │  Zero-hallucination   │     │  Block-first model  │     │  Frozen snapshots   │
│  Products +      │     │  Block source taxonomy │     │  20 block types     │     │  SSR + hydration    │
│  Components +    │     │  Product Briefs        │     │  Inline spec tokens │     │  PDF via headless   │
│  Spec Fields     │     │  Document Types        │     │  4 search scopes    │     │  Chrome             │
│  8 field types   │     │  Brand Profiles + DQS  │     │  Edit/Preview modes │     │  Magic link access  │
│                  │     │  Claude (Anthropic)    │     │                     │     │  No DOCX export     │
└─────────────────┘     └──────────────────────┘     └────────────────────┘     └────────────────────┘
```

**Data flows left-to-right.** Spec fields are the single source of truth. The AI generator reads specs and briefs to produce blocks. The editor manipulates blocks with live spec references. The portal freezes the document into an immutable snapshot for distribution.

### 1.2 Cross-Cutting Systems

| System | Feature # | Touches |
|--------|-----------|---------|
| Smart Spec Tracking | 4 | Spec DB → Editor → Portal (staleness propagation, two-speed update, variant-aware review dashboard) |
| Collaboration & Review | 6 | Editor → Portal (state machine, approvals, sub-block comments, unified notification system) |
| Content Reuse | 7 | Editor → Portal (snippets with live transclusion, templates, block library, document duplication) |
| Product Variants | 8 | Spec DB → Generator → Editor → Portal (delta-from-base model across entire pipeline) |
| External Sync | 9 | External systems → Spec DB (SpecReconciler, mutation taxonomy, adapter layer) — **deferred post-launch** |
| Enterprise Readiness | 10 | All modules (permissions via `canDo` abstraction, attribution, auth decoupling — guardrails only) |

### 1.3 Supporting Specifications

| Spec | Scope |
|------|-------|
| Workspace Admin | 4 workspace roles (Owner, Admin, Member, Viewer), permission matrix, member management, Document Type and Brand Profile configuration |
| Analytics Event Model | 7 event types, 3 analytics surfaces, visitor identity model |
| Onboarding | AI assistant with spotlight, admin setup checklist, member first-run, empty state patterns |
| Error Handling Matrix | Archive-only lifecycle, pre-flight checks, cascading rules for all entity types |
| Billing & Pricing | Seat-based model (Editor paid, Viewer free), AI generation included, no metering at v1 |
| Connectivity Model | Local save queue, block-level conflict resolution on reconnect, operations blocked offline |

### 1.4 Key Architectural Invariants

These invariants are established across multiple specs and should be treated as load-bearing constraints:

1. **Single source of truth for specs.** All spec data lives in the Spec Database. Every other module references it; none duplicates it.
2. **Block-first document model.** All document content is typed blocks with a source taxonomy (`spec-referenced`, `brief-referenced`, `placeholder`, `manual`, `snippet`, `structural`). This is the shared contract between Generator, Editor, Portal, and Content Reuse.
3. **Graph model, not tree.** Components are independent entities. Products compose them via ProductComponent join records. This enables the variant model and cross-product component reuse.
4. **Two-speed update.** Structured content (spec tables, tokens) auto-updates when specs change. Prose content (paragraphs, headings) is flagged for human review. This distinction runs through Spec Tracking, Variants, and Content Reuse.
5. **Working copy vs. frozen snapshot.** The editor always works on a mutable working copy. The portal serves immutable snapshots. Brand changes apply at render time without republication.
6. **Zero-hallucination constraint.** The AI generator never produces content it cannot ground in Arther-owned data (specs, briefs, document type schemas).
7. **Archive-only for entities with dependents.** Hard deletion is only available when no downstream references exist. Entities with active dependents are archived, and cascading rules are defined per entity type.
8. **Unified notification system.** Collaboration & Review (Feature 6) owns all notification infrastructure. Other features define event types and recipients only.
9. **Single LLM provider.** Claude (Anthropic) is the AI provider. No abstraction layer, no user-facing model selection. Provider is invisible to users.

---

## 2 — Resolution Status of First-Pass Findings

### 2.1 Critical Conflicts — All Resolved

| # | Conflict | Resolution | Confirmed in |
|---|----------|------------|-------------|
| 2.1 | PDF rendering engine (Typst vs. headless Chrome) | Standardised on headless Chrome | Block Editor v1.2, Portal v1.2 |
| 2.2 | DOCX export contradiction | Removed from v1 scope | Block Editor v1.2 (DegradationConfig reduced to PDF only), Portal v1.2 |

### 2.2 High Conflicts — All Resolved

| # | Conflict | Resolution | Confirmed in |
|---|----------|------------|-------------|
| 2.3 | Block type canon mismatch | Code Block and Callout added to BlockType union; Tabs removed from Portal | Block Editor v1.2, Portal v1.2 |
| 2.4 | BlockSpecReference schema divergence | `variant_id` added to BlockSpecReference in Spec Database | Spec Database v1.4 |

### 2.3 Medium Conflicts — All Resolved

| # | Conflict | Resolution | Confirmed in |
|---|----------|------------|-------------|
| 2.5 | Brand Profile vs. DQS enforcement boundary | DQS violations are advisory at pre-flight, not blocking | Error Handling Matrix v1.0 |
| 2.6 | Comment model ownership | Feature 6 owns comments; sub-block text-range anchoring added with `anchor_type` and `text_anchor` fields on `CommentThread`; orphaning extended to text edits | Collaboration & Review v1.1 |
| 2.7 | Notification architecture fragmentation | Consolidated into Feature 6; Smart Spec Tracking v1.2 removed `UserNotificationPreferences`; Content Reuse v1.1 replaced `SnippetOverrideNotification` with event taxonomy | All updated specs |

### 2.4 Blocking Open Questions — All Resolved

| # | Question | Resolution | Confirmed in |
|---|----------|------------|-------------|
| 1 | Multi-provider AI strategy | Single provider (Claude/Anthropic), no abstraction layer | AI Generator v1.2 §3.7 |
| 2 | Document Type versioning | Existing docs untouched; regeneration on demand | AI Generator v1.2 §3.8 |
| 3 | Empty spec fields during generation | Placeholder blocks inserted | AI Generator v1.2 |
| 4 | Comment anchoring model | Sub-block text-range for prose blocks; block-level for all others | Collaboration & Review v1.1 |
| 5 | Undo/redo granularity | Block-action level, per-document per-session | Block Editor v1.2 |
| 6 | Cross-document paste behaviour | BlockSpecReference carries over; source resets to `manual` | Block Editor v1.2 |
| 7 | Merge conflict resolution UX | **Partially resolved** — see §3.1 below | Product Variants v1.1 (still blocking) |
| 8 | Adapter library strategy | First-party bespoke adapters only | External Sync v1.1 |
| 9 | Launch integration list | Arena PLM first, deferred post-launch | External Sync v1.1 |

### 2.5 Coverage Gaps — All Addressed

| Gap | Resolution |
|-----|-----------|
| Workspace / Admin Panel | New spec: `arther-workspace-admin.md` |
| Editor-Side Search | Added to Block Editor v1.2 — 4 search scopes |
| Analytics / Usage Tracking | New spec: `arther-analytics-event-model.md` |
| Onboarding / First-Run | New spec: `arther-onboarding.md` |
| Error Handling / Edge Cases | New spec: `arther-error-handling-matrix.md` |
| Billing and Pricing | New spec: `arther-billing-pricing.md` |
| Migration / Import Path | Confirmed deferred post-launch |
| Offline / Connectivity | New spec: `arther-connectivity-model.md` |

### 2.6 Cross-Feature Blocking Dependencies — All Resolved

| Dependency | Resolution |
|------------|-----------|
| Variant-aware snippet behaviour | Snippets resolve spec tokens against embedding document's product context at render time; variant-aware through document context, not snippet configuration | 
| SpecReconciler variant import | Deferred with External Sync — variant data model exposes clean creation API for future integration |
| Comment model confirmation | Fully confirmed with sub-block text-range anchoring in Collaboration & Review v1.1 |

---

## 3 — Remaining Conflicts and Inconsistencies

### 3.1 BLOCKING: Product Variants — Merge Conflict Resolution UX

**Source:** Product Variants v1.1, Open Questions table

The merge conflict resolution UX is still marked as "Must resolve before build." When two variants generate different content for an unlinked block at the same structural position, the author must resolve the conflict manually. The exact editor surface — inline resolution in the merge diff view, or a dedicated conflict queue — has not been designed.

The first-pass synthesis proposed a two-path resolution model (AI-generated blocks → re-generation via staleness dashboard; human-edited blocks → side-by-side conflict panel). This decision was recorded in the original synthesis but was not incorporated into the Product Variants spec itself.

**Action required:** Transfer the resolution model from the first synthesis into the Product Variants spec as a design decision, or revise it. The interaction model needs to be decided before build.

### 3.2 MEDIUM: Product Overview Contains Stale Terminology and Numbers

The Product Overview has not been updated to reflect decisions made across the feature specs. Specific discrepancies:

**"Style Profile"** — The Product Overview (line 78) uses the term "Style Profiles" to describe brand voice, tone, colour palette, and unit preferences. The AI Document Generator splits this into two distinct concepts: **Brand Profile** (visual/tonal identity applied at render time) and **Document Quality Standards** (structural rules like reading level and section length enforced at generation time). The term "Style Profile" does not appear in any feature spec.

**"15+ block types"** — The Product Overview (line 82) says the editor supports "15+ block types." The Block Editor v1.2 defines a `BlockType` union with 20 entries.

**"Hierarchical product database — Products → Assemblies → Components"** — The Product Overview (line 70) describes a tree hierarchy with an explicit "Assemblies" level between Products and Components. The Spec Database defines a graph model where Components are independent entities composed into Products via `ProductComponent` join records. There is no separate Assembly entity — the graph model is the foundational architectural decision.

**Portal variant comparison** — The Product Overview (line 108) states: "The portal surfaces a comparison view where visitors can select variants from a dropdown and compare them side-by-side." The Product Variants spec (§8, Out of Scope) explicitly defers the portal-facing comparison page: "A portal-facing page that lets customers compare two variants of a product is a meaningful future feature… but it requires design work on portal information architecture that is out of scope here." The comparison view in the spec is an internal authoring tool only.

**Action required:** Update the Product Overview to align with current spec decisions before PRD. This is editorial work, not a design decision.

### 3.3 MEDIUM: Block Type Count Discrepancy in Block Editor

The Block Editor v1.2 closing summary states "19 block types" but the `BlockType` union in the spec contains 20 entries: `heading`, `paragraph`, `spec_table`, `image`, `gif`, `video`, `accordion`, `step_wizard`, `hotspot_image`, `chart`, `safety_block`, `divider`, `table`, `list`, `blockquote`, `embedded_link`, `checklist`, `snippet_embed`, `code_block`, `callout`.

**Action required:** Correct the closing summary to say 20 block types. Minor copy fix.

### 3.4 LOW: Spec Database Version Label Inconsistency

The Spec Database header says v1.4 but the closing summary text still references "Version 1.3."

**Action required:** Update the closing summary to say v1.4. Minor copy fix.

### 3.5 LOW: Feature Index Is Stale

The Feature Index still shows Features 5–10 as "Not started" with "Document: —" when all have complete specs at v1.1+. Feature 3's key questions still mention DOCX degradation rules. Feature 5's key questions still ask about DOCX export. Feature 6's status says "Not started" when the spec is at v1.1.

**Action required:** Update the Feature Index to reflect current spec status. This was flagged in the first synthesis and has not been addressed.

### 3.6 LOW: Enterprise Readiness Guardrails Terminology Mismatch

The Enterprise Readiness guardrails (Decision 1) reference a flat role model of "owner, editor, viewer." The Workspace Admin spec defines four roles: Owner, Admin, Member, Viewer. The terminology mismatch could cause confusion if the Enterprise guardrails are read as prescriptive. The guardrails explicitly say "the implementation doesn't matter yet" — the example roles are illustrative, not binding.

**Action required:** No spec change needed, but note the terminology difference when writing the PRD. The Workspace Admin spec's four-role model is authoritative.

---

## 4 — Remaining Open Questions

### 4.1 Must Resolve Before Build

| # | Feature | Question | Notes |
|---|---------|----------|-------|
| 1 | Product Variants (Feature 8) | Merge conflict resolution UX | See §3.1. The interaction model for resolving conflicts between variant-generated content at the same structural position must be designed. |
| 2 | Smart Spec Tracking (Feature 4) | Domain owner UI | The domain owner assignment and management surface is not yet designed. Domain owners are referenced throughout the feature as the routing target for review items, but the UI for assigning ownership to field categories is unspecified. |

### 4.2 Should Resolve Before PRD

| # | Feature | Question | Notes |
|---|---------|----------|-------|
| 3 | Smart Spec Tracking (Feature 4) | Staleness consolidation window | When a batch of spec changes triggers many stale flags simultaneously, should they be consolidated into a single review item or presented individually? Affects review dashboard usability. |
| 4 | Smart Spec Tracking (Feature 4) | Notification policy (frequency, batching) | Real-time, hourly digest, or daily digest? Feature 6 owns the delivery infrastructure but the policy for staleness notifications is not defined. |
| 5 | Smart Spec Tracking (Feature 4) | Coverage report caching strategy | For large workspaces, computing spec coverage across all documents may be expensive. Whether to cache or compute on demand. |
| 6 | Content Reuse (Feature 7) | Block library organisation model | How are library items organised for discoverability? Search is necessary; whether categories or tags are also needed depends on library scale. |
| 7 | Content Reuse (Feature 7) | Cross-workspace snippet sharing | Enterprise tier may need snippets shared across workspaces (parent org sharing compliance boilerplate). Currently assumed single-workspace scope. |
| 8 | Content Reuse (Feature 7) | Template versioning | Whether template items in the library maintain version history for the author's own reference. Minor UX question. |
| 9 | Product Variants (Feature 8) | Default variant behaviour on base URL | Redirect to `is_default` variant or show picker? Proposed as a workspace-level publishing setting. |
| 10 | Product Variants (Feature 8) | Maximum delta size advisory threshold | What percentage of fields overridden triggers the "consider making this a separate product" advisory? |

### 4.3 Can Resolve During Build

| # | Feature | Question |
|---|---------|----------|
| 11 | Product Variants | Variant slug uniqueness scope — product-level vs. workspace-level |
| 12 | External Sync | Tier 3 notification routing — immediate notification vs. queue badge only |
| 13 | External Sync | Conflict queue assignment fallback chain when no domain owner is configured |
| 14 | External Sync | Blast radius computation cost — on-demand vs. cached |
| 15 | External Sync | Conflict policy configurability per field — UI surface in field settings |
| 16 | AI Document Generator | Document Type editor UX details |
| 17 | AI Document Generator | Brief versioning depth — how many prior brief versions are accessible |
| 18 | AI Document Generator | Compliance agents — whether to add domain-specific validation (future) |

---

## 5 — Cross-Feature Consistency Check

### 5.1 Workspace Roles — Consistent

The Workspace Admin spec defines four roles: **Owner**, **Admin**, **Member**, **Viewer**. The Billing spec aligns: Editor seats (Owner, Admin, Member) are paid; Viewer seats are free. The Viewer role's permissions (view, comment, approve/reject in Review) are consistent with Collaboration & Review's approval model.

The Enterprise Readiness guardrails' `canDo(user, action, resource)` abstraction accommodates this role model without modification.

**One note:** The Collaboration & Review spec references "document owner" as a per-document assignment (the person who can apply snippet overrides, approve publications, etc.), not as a workspace role. This is correct and consistent — "document owner" is a resource-level role, not a workspace-level role. The distinction is clear in the specs but should be made explicit in the PRD to avoid confusion.

### 5.2 Notification Event Taxonomy — Consistent

All features now correctly delegate notification delivery to Feature 6. The event taxonomy across features:

| Source Feature | Event Types |
|---------------|-------------|
| Smart Spec Tracking (4) | `spec_field.changed`, `block.stale_structured`, `block.stale_prose`, `review_item.created`, `review_item.overdue` |
| Collaboration & Review (6) | `comment.created`, `comment.mentioned`, `review.requested`, `review.approved`, `review.rejected`, `document.state_changed` |
| Content Reuse (7) | `snippet.override_created`, `snippet.source_changed_while_overridden`, `snippet.stale_prose_flagged`, `snippet.stale_prose_resolved_locally` |
| Product Variants (8) | Variant-aware staleness notifications (propagated through Feature 4's taxonomy with variant context) |
| External Sync (9) | `sync.conflict_detected`, `sync.tier2_applied`, `sync.tier3_held`, `sync.gap_detected`, `sync.credential_expiring` (deferred post-launch) |
| Analytics (12) | No user-facing notifications — analytics are dashboard-only |

No duplicate notification infrastructure exists. Each feature defines events and recipients; Feature 6 owns delivery channels, read-state tracking, and user preferences.

### 5.3 Block Source Taxonomy — Consistent

The six block sources (`spec-referenced`, `brief-referenced`, `placeholder`, `manual`, `snippet`, `structural`) are consistently used across the AI Generator, Block Editor, Smart Spec Tracking, Content Reuse, and Publishing Portal.

**One ambiguity remains:** When a `spec-referenced` block's prose is manually edited by the author, the block's source type is not explicitly reclassified. The two-speed update model handles this correctly at runtime (structured tokens auto-update, prose is flagged for review), but the source type metadata on the block itself doesn't change. This is probably correct behaviour — the block is still spec-referenced even if its prose has been edited — but the PRD should make this explicit to prevent implementation confusion.

### 5.4 Document State Machine — Consistent

The state machine (Draft → In Review → Approved → Published) is defined in Collaboration & Review and consistently referenced by:

- Error Handling Matrix: documents in Review returned to Draft when a referenced component is archived
- Publishing Portal: only Approved documents can be published; publication creates a frozen snapshot
- Smart Spec Tracking: staleness flags surface regardless of document state but do not block state transitions (advisory only)
- Connectivity Model: state transitions (send for review, approve, publish) blocked offline

### 5.5 Variant Awareness — Consistent

The variant model propagates correctly through the pipeline:

- **Spec Database v1.4:** `BlockSpecReference` includes `variant_id`
- **AI Generator v1.2:** Receives fully resolved spec set per variant; no variant-specific generation logic needed
- **Block Editor v1.2:** Canonical view + variant preview mode; blocks carry `BlockVariantScope` with ALL/DERIVED/MANUAL modes
- **Smart Spec Tracking v1.2:** Variant-aware staleness queries; review items include affected variant(s)
- **Content Reuse v1.1:** Snippets resolve spec tokens against embedding document's product context, which includes variant overrides
- **Publishing Portal v1.2:** Each variant gets a canonical URL; variant picker on base product URL

### 5.6 Pre-Flight Checks — Consistent

The Error Handling Matrix defines pre-flight checks at review submission:

| Check | Severity |
|-------|----------|
| Placeholder blocks present | **Blocking** — cannot send for review |
| Orphaned spec tokens (referenced field archived/deleted) | **Blocking** |
| Stale blocks (spec value changed since generation) | **Advisory** — warning, can proceed |
| Unresolved comments | **Blocking** |
| DQS violations (section length, reading level, etc.) | **Advisory** — warning, can proceed |
| Vacant approval role (no user assigned to a required approval role) | **Blocking** |

This is consistent with the Collaboration & Review state machine and the AI Generator's DQS model.

---

## 6 — Feature Dependency Map (Updated)

```
Feature 1: Spec Database ─────────────────────────────────────────────────────┐
  │                                                                           │
  ├──▶ Feature 2: AI Document Generator                                       │
  │      │                                                                    │
  │      ├──▶ Feature 3: Visual Block Editor ◀── Feature 7: Content Reuse     │
  │      │      │                                    │                        │
  │      │      ├──▶ Feature 5: Publishing Portal ◀──┘                        │
  │      │      │                                                             │
  │      │      └──▶ Feature 6: Collaboration & Review ──▶ Feature 5          │
  │      │                                                                    │
  │      └──▶ Feature 8: Product Variants ──▶ Feature 3, 5, 7                 │
  │                                                                           │
  └──▶ Feature 9: External Sync (post-launch)                                 │
                                                                              │
Feature 10: Enterprise Readiness ─────────────────────────────────────────────┘
  (touches all features — permissions, attribution, auth)

Supporting specs (no pipeline dependencies):
  ├── Workspace Admin — configures roles, Doc Types, Brand Profiles
  ├── Analytics Event Model — instrumentation across portal and workspace
  ├── Onboarding — first-run flows for admins and members
  ├── Error Handling Matrix — lifecycle rules and pre-flight checks
  ├── Billing & Pricing — seat model and role-to-tier mapping
  └── Connectivity Model — offline behaviour and reconnection
```

**Critical path:** Spec Database → Block Model (shared contract) → AI Generator + Block Editor → Publishing Portal. The block model remains the most load-bearing interface in the system. Any changes to block types, source taxonomy, or inline token model ripple through every feature.

### Build Order Implications

1. **Spec Database + Block Model** must be locked first. These are the two foundational data contracts.
2. **Block Editor** should be built next — primary user-facing surface and integration point for most cross-cutting features.
3. **AI Generator** can be built in parallel with the Editor since it produces blocks but doesn't consume editor state.
4. **Smart Spec Tracking** and **Collaboration & Review** layer on top of the Editor.
5. **Content Reuse** depends on the block model being stable.
6. **Publishing Portal** is the end of the pipeline and should be built after the block model and editor are stable.
7. **Product Variants** is the most cross-cutting feature and should be designed early but can be implemented incrementally.
8. **External Sync** is deferred post-launch — no build dependency on v1 pipeline.
9. **Supporting specs** (Workspace Admin, Analytics, Onboarding, Error Handling, Billing, Connectivity) are implementation concerns that layer onto the core pipeline. They can be built incrementally alongside the features they support.

---

## 7 — Recommended Actions Before PRD

### 7.1 Must Do

| # | Item | Action | Effort |
|---|------|--------|--------|
| 1 | Merge conflict resolution UX (Product Variants) | Design the editor surface for resolving conflicts between variant-generated content at the same structural position. Transfer the first-synthesis resolution model into the spec, or revise it. | Design session |
| 2 | Domain owner UI (Smart Spec Tracking) | Design the UI for assigning domain ownership to field categories. This is the routing mechanism for the entire staleness review workflow. | Design session |
| 3 | Update Product Overview | Align terminology (Brand Profile, not Style Profile), numbers (20 block types, not 15+), architecture description (graph model, not tree hierarchy), and portal variant comparison (internal tool only, not portal-facing). | Editorial — 30 minutes |
| 4 | Update Feature Index | Reflect current spec status for all features. Remove stale DOCX references from key questions. | Editorial — 15 minutes |
| 5 | Fix minor copy errors | Block Editor: "19 block types" → "20 block types". Spec Database: closing summary "Version 1.3" → "Version 1.4". | Copy fixes — 5 minutes |

### 7.2 Should Do Before PRD

| # | Item | Recommendation |
|---|------|----------------|
| 6 | Staleness notification policy | Decide on frequency model (real-time, batched, digest) as part of the PRD's notification architecture section. This affects Feature 4 and Feature 6. |
| 7 | Block library organisation model | Decide whether tags, categories, or flat search is the v1 approach for Content Reuse. Affects the library UI design. |
| 8 | Clarify "generated-then-edited" block source behaviour | The block source taxonomy covers generated blocks and manual blocks, but a generated block whose prose has been manually edited occupies a middle state. The two-speed update model handles it at runtime, but the source type metadata doesn't change. Make this explicit in the PRD. |

### 7.3 Improvements to Existing Specs (Non-Blocking)

| Spec | Improvement |
|------|-------------|
| **AI Document Generator** | Define media handling during generation — how are images/media referenced in Product Briefs handled? The block model supports image blocks but generation doesn't address media sourcing. |
| **AI Document Generator** | Clarify regeneration behaviour for blocks that were generated then manually edited. The source taxonomy treats them as still spec-referenced, but the two-speed model flags their prose for review rather than auto-updating. Make this explicit. |
| **Smart Spec Tracking** | Clarify variant-aware coverage calculation — is coverage measured per-variant or for the base product only? |
| **Smart Spec Tracking** | Define how the action dashboard prioritises items when multiple variants of the same product have pending reviews. |
| **Block Editor** | Define keyboard shortcut model. Address accessibility requirements (screen reader support, keyboard navigation). |
| **Collaboration & Review** | Define whether each variant needs separate approval in the review workflow, or whether approval of the base document covers all variants. |
| **Content Reuse** | Define cross-workspace snippet sharing model for enterprise tier (currently single-workspace scope). |
| **Product Variants** | Define maximum variant count per product (if any). Define variant ordering/grouping in the portal's variant picker. |

### 7.4 Architectural Recommendations

**Shared Block Schema Package.** The block model is referenced by at least 8 features. It should be defined in a single canonical location (not duplicated across specs) and treated as a versioned contract. Any change to block types, source taxonomy, or inline token model should be treated as a breaking change requiring review across all dependent specs. The current canonical definition lives in the Block Editor spec (Feature 3), which is the correct home — but the PRD should reference it as the single source of truth.

**Unified State Machine.** The document state machine (Draft → In Review → Approved → Published) from Collaboration & Review should be explicitly referenced by every feature that touches document lifecycle. This is now mostly consistent across specs, but the PRD should formalise the state machine as a top-level architectural primitive.

**Event-Driven Architecture.** Multiple features react to the same events (spec field changed, document published, component archived). The notification consolidation into Feature 6 is the first step. The PRD should define a canonical set of domain events that all features subscribe to, extending beyond notifications to include cascading actions (staleness flags, archive cascades, pre-flight checks).

**Variant Resolution as a Service.** Product Variants defines "resolved spec computed at query time." This resolution logic is needed by the AI Generator, Block Editor, Smart Spec Tracking, and Publishing Portal. It should be a shared service with a well-defined interface, not reimplemented per feature. The variant data model correctly specifies caching with invalidation — the PRD should elevate this to a named architectural component.

---

## 8 — Items Explicitly Deferred (Confirmed Out of Scope for v1)

These items are mentioned across specs as explicitly deferred. Documenting them prevents accidental scope creep.

- External Sync / SpecReconciler (entire feature — post-launch, Arena PLM first)
- Multi-language / localisation support
- Enterprise features (SSO, SCIM, audit logs, advanced RBAC) — guardrails are in place but no build spec
- Real-time collaborative editing (Google Docs–style simultaneous cursors)
- AI-powered content suggestions / auto-complete within the editor
- Third-party marketplace for Document Types or Brand Profiles
- Custom block type creation by users
- Automated compliance checking against regulatory standards
- Version branching (git-style branching for documents)
- DOCX export
- Migration / import tooling for existing documentation (Word, PDF, Confluence)
- Billing admin UI (post-launch placeholder)
- Integration configuration UI (post-launch placeholder with External Sync)
- Portal-facing variant comparison page (internal authoring tool only at v1)
- Nested snippets (single-level transclusion only at v1)
- Two-way sync (ERP write-back)
- Cross-workspace snippet sharing (enterprise tier)
- Sub-hourly scheduled polling for External Sync
- Service worker or offline portal infrastructure

---

## 9 — Summary Scorecard

| Area | Status | Action Required |
|------|--------|-----------------|
| Core pipeline (Spec DB → Generator → Editor → Portal) | **Fully aligned** | No conflicts remain |
| Block model | **Complete** — 20 block types, 6 source types | Fix count in Block Editor summary |
| Spec tracking & staleness | **Well-specified**, variant-aware | Domain owner UI must be designed |
| Collaboration & review | **Complete** — unified notification system | No action needed |
| Content reuse | **Complete** — snippet–variant interaction resolved | Block library organisation is a should-do |
| Product variants | **Nearly complete** | Merge conflict resolution UX is blocking |
| External sync | **Deferred post-launch** — spec is complete for future build | No action needed |
| Enterprise readiness | **Guardrails sufficient** for v1 | No action needed |
| Workspace admin & settings | **Complete** — 4 roles, permission matrix | No action needed |
| Search (editor-side) | **Complete** — 4 search scopes in Block Editor v1.2 | No action needed |
| Onboarding | **Complete** — AI assistant, setup checklist, empty states | No action needed |
| Analytics | **Complete** — 7 events, 3 surfaces | No action needed |
| Error handling | **Complete** — archive-only lifecycle, pre-flight checks | No action needed |
| Billing & pricing | **Complete** — seat-based model | No action needed |
| Connectivity | **Complete** — local save queue, offline behaviour | No action needed |
| Notification architecture | **Consolidated** into Feature 6 | No action needed |
| Product Overview | **Stale** — terminology, numbers, architecture description | Must update |
| Feature Index | **Stale** — status and key questions outdated | Must update |

**Bottom line:** The spec suite is in strong shape. All critical and high-severity conflicts from the first synthesis are resolved. All eight coverage gaps have been addressed with new specifications. The cross-cutting concerns (variants, notifications, block type canon, error handling) are now defined consistently. Two items remain blocking: the merge conflict resolution UX for Product Variants and the domain owner assignment UI for Smart Spec Tracking. Three editorial corrections are needed (Product Overview, Feature Index, minor copy fixes). Once those are addressed, the specs are ready for PRD consolidation.
