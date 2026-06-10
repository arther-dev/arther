# Arther — Product Variants: Feature Specification

**Version:** 1.2  
**Date:** May 2026  
**Status:** Specification complete — greenfield design

**Changelog:**
- **v1.2** — Resolved merge conflict resolution UX (two-path model: AI-generated conflicts via staleness re-generation, human-edited conflicts via side-by-side resolution panel); added §4.8 Merge Conflict Resolution
- **v1.1** — Resolved open question on variant-aware snippet behaviour (snippets inherit variant context from embedding document; confirmed in Content Reuse feature)

---

## 1. Overview

### 1.1 Purpose

Product Variants is the feature that lets hardware companies document an entire product family from a single source of truth. A power supply that ships in 12V, 24V, and 48V configurations has one product record in Arther — with one document, one portal page, one review workflow — not three independent copies that drift apart as the product evolves.

The overwhelming pattern in hardware is that variants share most of their spec. The delta between a 12V and 48V model is a handful of field values, a changed transformer, and perhaps a different certification. Every other piece of documentation — the installation procedure, the mounting diagram, the warranty statement, the safety warnings — is identical. Without variants, teams either duplicate the entire document and accept the maintenance overhead, or they produce a single document that serves no variant precisely. Both are wrong. Arther's variant model makes the delta explicit and small, and generates documentation that is correct for each variant without duplicating authoring effort.

### 1.2 The Core Model: Delta from Base

Every variant in Arther is a delta applied to a base product. The base product is a complete, standalone product record with its own spec database entries, document, and portal page. A variant is a named set of overrides — field value changes, component swaps, component additions, component removals — that, when applied to the base product's resolved spec, produces a fully resolved spec set for that variant.

The delta model has three properties that matter for the rest of this feature:

**Deltas are always small.** A variant that overrides most of the base product's spec is not a variant — it is a new product. The data model does not enforce this, but the UX should make it natural to see when a variant delta has grown too large.

**Resolved specs are computed, not stored.** The variant does not have its own spec database rows. It has a list of overrides. The full resolved spec for a variant is computed at query time by starting with the base product's spec and applying the variant's delta. This keeps the spec database clean and makes it impossible for a variant to silently diverge from the base.

**Documents are shared, not duplicated.** There is one document per product. Variants surface inside that document as a preview dimension — the author can switch between variant views of the same document. Blocks are either shared across all variants, automatically scoped to variants where their referenced component exists, or manually scoped by the author. No block exists in multiple independent copies.

### 1.3 Role in Arther

Product Variants touches every other feature:

- **Upstream:** Product Spec Database — the variant delta model is an extension of the spec data model; resolved spec views feed the AI generator and the portal
- **Upstream:** AI Document Generator — the generator receives a fully resolved spec set per variant; its merge logic produces a single variant-aware document
- **Upstream:** Visual Block Editor — blocks acquire a variant scope property; the editor adds a variant preview switcher and canonical author view
- **Downstream:** Smart Spec Tracking — staleness detection becomes variant-aware; indicators must identify which variants are stale, not just whether a block is stale
- **Downstream:** Publishing Portal — each variant has its own canonical URL; the base product URL serves a variant picker; the portal renders the correct variant on navigation
- **Downstream:** Content Reuse — snippets embedded in variant-aware documents inherit variant scope from their embedding context; snippet review at source continues to apply
- **Downstream:** External Sync — the SpecReconciler abstraction (Feature 9) is the intended import path for variants already defined in PLM/ERP systems; the variant data model must expose a clean creation API for that integration

---

## 2. Who Uses This

### 2.1 Actors

**Product Manager / Documentation Lead** — Decides that a product family warrants variants rather than separate products. Creates the variant definitions. Triggers document generation per variant. Reviews the merged document and approves publication.

**Hardware Engineer / Spec Owner** — Owns the spec delta for each variant. Enters the field overrides, component swaps, and structural changes that define each variant's resolved spec. This is the same person who edits spec fields on the base product.

**Technical Writer** — Authors the variant-aware document. Works in canonical view to author content that applies to all variants. Switches into variant preview mode to verify that each variant reads coherently. Uses the side-by-side comparison view to audit divergence.

**Portal Visitor (Customer / Partner)** — Lands on the product's base URL, sees a variant picker, and navigates to the canonical URL for their specific variant. Reads documentation that is correct for that variant.

### 2.2 When Variants Are the Right Model

Not every product family needs variants. The distinction between a variant and a new product is meaningful and should be surfaced clearly in Arther's UX.

Use variants when:
- The product ships under one commercial name with configuration options (voltage, form factor, connector type, certification region)
- Most of the spec is shared and the delta is small — a handful of field overrides and at most a few component changes
- The documentation structure is identical across configurations and only specific values or sections differ

Create a new product (not a variant) when:
- The configurations have different commercial identities
- The spec delta is large enough that the variant would override the majority of base product fields
- The documentation structure differs significantly — different sections, different block ordering, different document types required

Arther does not enforce this distinction programmatically. The UX should make it visible: a variant delta summary showing the number of overrides gives the product manager a natural signal when a variant has grown into a new product.

---

## 3. Data Model

### 3.1 ProductVariant

```
ProductVariant {
  id:                  UUID
  product_id:          UUID               -- FK to base Product
  name:                string             -- Display name, e.g. "48V" or "EU Certified"
  slug:                string             -- URL segment, e.g. "48v" or "eu"
  description:         string?            -- Optional internal note on what this variant represents
  is_default:          boolean            -- If true, the base product URL redirects here when no variant is selected
  created_at:          timestamp
  created_by:          UUID
}
```

One base product can have many variants. The base product itself is always valid without any variants — it is not a template. Variants are additive.

### 3.2 VariantDelta

Each variant's departure from the base product is expressed as an ordered list of delta records.

```
VariantDelta {
  id:                        UUID
  variant_id:                UUID               -- FK to ProductVariant
  delta_type:                VariantDeltaType
  component_id:              UUID?              -- Component being affected (all types except COMPONENT_ADD)
  field_id:                  UUID?              -- Field being overridden (SCALAR_OVERRIDE only)
  override_value:            FieldValue?        -- New value (SCALAR_OVERRIDE only)
  replacement_component_id:  UUID?              -- Replaces component_id (COMPONENT_SWAP only)
  new_component_id:          UUID?              -- Added component (COMPONENT_ADD only)
  position_after:            UUID?              -- Component after which the new one is inserted (COMPONENT_ADD only)
  created_at:                timestamp
}

VariantDeltaType:
  SCALAR_OVERRIDE      -- Changes one field value on an existing component
  COMPONENT_SWAP       -- Replaces one component with a different component from the library
  COMPONENT_REMOVE     -- Removes a component from this variant's assembly
  COMPONENT_ADD        -- Adds a new component to this variant's assembly
```

The delta list is ordered by `created_at`. When computing a resolved spec, deltas are applied in creation order. If two deltas conflict (e.g., a SCALAR_OVERRIDE and a COMPONENT_REMOVE on the same component), the later delta wins and a validation warning is surfaced.

### 3.3 Resolved Spec View

The resolved spec for a variant is not stored. It is computed at query time:

1. Start with the base product's full component graph and all field values
2. For each `COMPONENT_REMOVE` delta: remove that component and all its fields from the working graph
3. For each `COMPONENT_SWAP` delta: replace the component node with the replacement; field values from the replacement's library definition are used unless the replacement has its own overrides in a subsequent delta
4. For each `COMPONENT_ADD` delta: insert the new component at the specified position with its library-default field values
5. For each `SCALAR_OVERRIDE` delta: apply the overridden field value to the appropriate component

The result is a flat resolved spec set structurally identical to the base product's spec set — the same shape, understood by the AI generator and the portal renderer without variant-specific logic.

The resolved spec is cached per variant with invalidation triggered by any change to the base product's spec or to the variant's delta list.

### 3.4 Block Variant Scope

Every block in a product's document carries a variant scope record.

```
BlockVariantScope {
  block_id:              UUID
  mode:                  VariantScopeMode
  variant_ids:           UUID[]            -- Populated for MANUAL mode only
  derived_component_id:  UUID?             -- Populated for DERIVED mode only
}

VariantScopeMode:
  ALL       -- Block applies to all variants (default for non-spec-linked blocks)
  DERIVED   -- Block's variant membership is computed from its spec linkages
  MANUAL    -- Block's variant membership is explicitly set by the author
```

**ALL** is the default for every block that has no spec linkage. Prose blocks, image blocks, video blocks, and any block whose content does not reference a spec field are ALL-scoped unless the author explicitly overrides.

**DERIVED** applies to blocks that reference a spec field belonging to a specific component. If that component does not exist in a given variant's resolved spec (because it was removed by a `COMPONENT_REMOVE` delta, or was never added via `COMPONENT_ADD`), the block is not shown when that variant is previewed. The `derived_component_id` stores the component whose presence determines visibility. If a block references fields from multiple components, the block is visible in any variant where at least one of those components exists; the exact policy is resolved at render time.

**MANUAL** applies when the author has explicitly overridden the default scope. The `variant_ids` list is the explicit set of variants this block appears in. MANUAL scope takes precedence over DERIVED scope — an author can force a block to appear in a variant whose component graph would otherwise exclude it, or hide a block from a variant where it would otherwise be shown.

### 3.5 VariantGenerationJob

Tracks the state of document generation for a specific variant.

```
VariantGenerationJob {
  id:              UUID
  product_id:      UUID
  variant_id:      UUID
  status:          PENDING | RUNNING | COMPLETE | FAILED
  triggered_by:    UUID
  triggered_at:    timestamp
  completed_at:    timestamp?
  block_tree:      JSON?           -- Output of generation, stored temporarily for merge step
  error:           string?
}
```

Generation is triggered manually by the documentation lead. It is not triggered automatically on variant creation. Multiple variants can generate concurrently; the merge step waits for all running jobs to complete before executing.

### 3.6 VariantComparisonView

Not a stored record — computed on demand from two variants' resolved documents.

```
VariantComparisonView {
  product_id:      UUID
  variant_a_id:    UUID
  variant_b_id:    UUID
  blocks:          ComparisonBlock[]
}

ComparisonBlock {
  block_id:        UUID
  position:        integer
  is_divergent:    boolean
  variant_a:       BlockSnapshot?    -- null if block absent from variant A
  variant_b:       BlockSnapshot?    -- null if block absent from variant B
}
```

---

## 4. Feature Behaviour

### 4.1 Creating a Variant

The variant creation flow is initiated from the base product's record in the spec database. Two entry points are supported:

**Manual creation (from base):**
1. The user opens the base product and selects "Add Variant"
2. They provide a name and slug. The slug must be unique within the product's variants
3. Arther creates a `ProductVariant` record with an empty delta list
4. The user is taken to the variant's delta editor, which shows the base product's full component graph as the starting point
5. They apply overrides, swaps, additions, and removals until the variant's delta correctly represents the configuration
6. The variant is saved. No document generation is triggered

**PLM import (via SpecReconciler, Feature 9):**
The External Sync feature will introduce a SpecReconciler abstraction that normalises incoming PLM/ERP payloads into Arther's data model. Variants defined in Arena, Duro, Windchill, or PTC as separate part numbers can be imported as `ProductVariant` records with their `VariantDelta` lists computed from the diff between the base part number's attributes and the variant part number's attributes. The variant data model is designed to expose a clean creation API for this integration. The SpecReconciler implementation is out of scope for this feature document.

### 4.2 The Variant Delta Editor

The delta editor is the primary interface for defining what a variant is. It is distinct from the main spec database editor — it shows the base product's resolved spec as a reference and lets the user express departures from it.

The editor has three panels:

**Base spec panel (left):** The base product's component graph, read-only. Shows all components and their field values. This is the starting point the variant delta is applied to.

**Delta panel (centre):** The variant's accumulated deltas, displayed as a list of change records. Each delta shows its type, affected component, field (if applicable), and old and new values. Deltas can be removed or reordered here.

**Resolved spec preview (right):** The computed resolved spec for this variant, updated live as deltas are added or removed. This is what the AI generator will see. It should look identical in structure to the base spec panel, with overridden values highlighted.

The delta editor supports four operations:
- **Override a field value:** Click any field in the base spec panel, enter a new value. Creates a `SCALAR_OVERRIDE` delta
- **Swap a component:** Click a component in the base spec panel, select "Swap with library component," choose the replacement. Creates a `COMPONENT_SWAP` delta
- **Remove a component:** Click a component, select "Exclude from this variant." Creates a `COMPONENT_REMOVE` delta
- **Add a component:** Use the "Add component" affordance, select from the component library, choose insertion position. Creates a `COMPONENT_ADD` delta

A **delta summary** is always visible: "N field overrides, M component changes." When this number grows large relative to the total spec size, Arther surfaces a non-blocking advisory: "This variant differs from the base product in X% of fields. Consider whether this should be a separate product."

### 4.3 Document Generation for Variants

Document generation for variants is always manually triggered. The flow:

1. From the product's document, the documentation lead opens the "Variants" panel
2. The panel shows all variants with their generation status: Not generated / Generated (date) / Generating
3. The lead selects one or more variants and triggers generation
4. Arther creates a `VariantGenerationJob` per selected variant and begins generation concurrently

**Per-variant generation:**
Each variant is generated independently. The AI generator receives the variant's fully resolved spec set — identical in structure to what it receives for a base product generation, with no variant-specific logic required. The generator produces a complete block tree for the variant, with explicit spec linkages preserved in every spec-referenced block. The output is a structured block tree, not rendered prose.

**Merge step:**
Once all selected variants have completed generation, Arther runs the merge step:

1. Collect all generated block trees, plus the existing document's block tree (which may already contain blocks from a previous generation)
2. For each position in the document structure, compare the block across all variants:
   - Blocks with the same spec field linkage but different resolved values → merge into one shared block. The spec reference node within the block renders the correct variant value at preview time
   - Blocks with no spec linkage at the same structural position with equivalent content → merge into one shared prose block
   - Blocks that exist in only one variant's output → create as a DERIVED-scoped block linked to the component that made them variant-specific
3. The merged result replaces the document's block tree
4. The documentation lead is taken to the document with a merge summary: "X blocks are shared, Y blocks are variant-specific, Z conflicts need review"

**Merge conflicts:**
A conflict occurs when two variants generate different content for a block that has no spec linkage to anchor the merge. For example, two variants generate different introductory paragraphs where the difference is not traceable to a spec field. These blocks cannot be automatically merged. They are flagged for the author to resolve manually: keep variant A's version, keep variant B's version, or write a new version that either applies to all variants or is manually scoped.

### 4.4 Authoring Variant-Aware Documents

The document editor adds two modes for variant-aware documents: **canonical view** and **variant preview mode**.

**Canonical view (default):**
The editor opens in canonical view. All blocks are visible regardless of variant scope. Variant-scoped blocks display a variant badge showing which variants they apply to (e.g., "48V only" or "12V, 24V"). ALL-scoped blocks have no badge. The author edits the document here: writing prose, inserting blocks, reordering sections. New blocks inserted in canonical view default to ALL scope.

**Variant preview mode:**
A variant switcher in the editor toolbar lets the author select a specific variant to preview. In preview mode, the canvas collapses to show only blocks that apply to the selected variant. The editor looks like the portal reader's view. Blocks that are hidden in this variant are collapsed to a thin placeholder rail — visible to the author as "not shown in this variant" but not rendered. Switching variants updates the canvas without navigating away. The author can edit in preview mode; blocks created in preview mode are scoped to the currently previewed variant by default (DERIVED if the content is spec-linked, MANUAL if it is not).

**Manual scope override:**
Any block's variant scope can be overridden via the block's context menu. Selecting "Variant scope" opens a small popover showing all variants with checkboxes. Unchecking a variant hides the block from that variant. This is the escape hatch for cases like variant-specific safety warnings, regional certification notices, or other content that is not spec-linked but should not appear in all variants.

**Block variant scope inheritance for non-spec-linked blocks:**
Non-spec-linked blocks default to ALL scope. This is the right default: a safety warning, an installation procedure, a warranty statement applies to all variants unless the author says otherwise. The manual scope override exists for the minority of cases where it doesn't.

### 4.5 Variant Preview on the Portal

**URL structure:**
```
/products/{product-slug}/                     → Variant picker landing page
/products/{product-slug}/{variant-slug}/      → Canonical URL for a specific variant
```

The base product URL serves a variant picker: a page listing all variants with their names, a brief description (pulled from `ProductVariant.description`), and a summary of the key differentiating spec values. The picker is generated from live spec data, not authored manually.

The `is_default` flag on `ProductVariant` determines which variant the picker highlights and which URL is used for sharing when no variant is specified. If only one variant exists, the base product URL may redirect directly to it — this is a workspace-level publishing setting.

**Variant switcher:**
On any variant's portal page, a persistent switcher (sidebar or top-bar depending on portal layout) lists all published variants. Selecting a variant navigates to that variant's canonical URL. The switcher is always visible — customers should always know what variant they are reading and how to find others.

**Snapshot model:**
Each variant's portal page is published from its own document snapshot. Publishing variant A does not publish variant B. Snapshot versioning, revision history, and gated access work identically to the base portal model — the variant is treated as an independent portal page that happens to share a document source with other variants.

### 4.6 Variant Comparison View

The comparison view is accessible from the product's document via the "Compare variants" action. It is not a portal-facing feature — it is an internal authoring and review tool.

The comparison renders two variants side-by-side in a two-column layout. The author selects which two variants to compare from a picker.

**Layout:**
- Left column: Variant A's resolved document
- Right column: Variant B's resolved document
- Both columns scroll in sync
- Blocks that are identical across both variants render normally in both columns
- Blocks that differ between variants are highlighted — a subtle background colour distinguishes divergent blocks from shared ones
- Blocks that exist in one variant but not the other show the present block in one column and a "Not in this variant" placeholder in the other

The comparison is block-level, not line-level. It does not show a red/green word-diff of prose. The full content of each block is visible in both columns; the highlight signals "these are different, look at both."

**Use cases:**
- Technical writers verifying that each variant reads coherently before publishing
- Documentation leads auditing how much a variant diverges from the base
- Engineers reviewing whether spec changes have propagated correctly into variant-specific blocks

The comparison view is read-only. Edits are made in the main editor.

### 4.7 Staleness in Variant-Aware Documents

Staleness detection is variant-aware. A block that references a spec field may be stale for one variant but current for another — for example, if the 48V variant's `output_voltage` field was updated but the 12V variant's was not.

Staleness indicators throughout the product must identify **which variants** are stale, not just whether a block is stale:

- In the editor's canonical view, a stale block badge shows "Stale in: 48V" rather than a plain stale indicator
- In variant preview mode, a stale block shows a stale indicator only when the previewed variant is one of the stale variants
- In the Smart Spec Tracking action dashboard, review items include the affected variant(s) in their detail
- The spec coverage report, bulk review triggers, and domain owner routing from Feature 4 all propagate variant context through the review item record

The `BlockSpecReference` record (defined in the AI Document Generator feature) must be extended with a `variant_id` field to support this. A single block may have multiple `BlockSpecReference` records — one per variant for which it holds a spec-linked value.

### 4.8 Merge Conflict Resolution

When the generate-per-variant-then-merge step (§4.3) produces conflicts — blocks at the same structural position with different content and no spec linkage to anchor the merge — those conflicts must be resolved by the author. The resolution model distinguishes two cases based on block origin:

**AI-generated conflicts (non-blocking):**
When two variants generate different content for an unlinked block at the same structural position, and neither block has been manually edited, the conflict is treated as a staleness-class issue. Both variant versions are preserved as MANUAL-scoped blocks (one per variant), and a merge review item is surfaced in the Smart Spec Tracking action dashboard. The author can resolve at their own pace — the document remains editable. Resolution options:

- **Re-generate** — triggers a targeted regeneration of the block for the affected variants, using the current resolved specs. If the regeneration produces equivalent content, the blocks merge automatically.
- **Keep both** — accepts the divergence. Each variant retains its own version of the block, manually scoped.
- **Write shared version** — the author writes a single version that applies to all variants (scope set to ALL) or manually scopes it.

**Human-edited conflicts (blocking for publish):**
When a block that has been manually edited by the author is affected by a subsequent variant generation or base spec change, the conflict is genuine — it represents a tension between the author's editorial intent and new generated content. These conflicts are surfaced when the variant is opened for editing and block the document from publication until resolved. The resolution surface is a side-by-side panel:

- Left column: the author's existing content (with the base or prior variant version)
- Right column: the new generated content (with the changed spec values highlighted)
- Three actions per block: **Keep mine** (preserve the author's version) / **Adopt new** (accept the generated version) / **Re-generate** (re-run generation for this block with the current resolved spec and review the output)

Resolution is block-by-block. In practice, merge conflicts are expected to be small and infrequent — the spec-linkage merge anchor resolves the majority of variant differences automatically. Conflicts only arise for unlinked prose blocks where variants generate meaningfully different content, which is the minority case.

---

## 5. UX Flows

### 5.1 Creating and Configuring a Variant

1. User navigates to a base product in the spec database
2. Selects "Variants" tab → sees existing variants (if any) and "Add variant" button
3. Clicks "Add variant" → modal: name, slug, optional description
4. Variant created → taken to delta editor showing base spec on left, empty delta list in centre, resolved preview on right
5. User applies overrides: clicks fields, swaps components, removes/adds components
6. Delta summary updates live; advisory shown if delta grows large
7. User saves the variant. No document action triggered

### 5.2 Generating a Variant's Document Content

1. User opens the product's document
2. Opens "Variants" panel in the editor sidebar
3. Sees variant list with status: "Not generated" for new variants
4. Selects one or more variants, clicks "Generate"
5. Generation status updates to "Generating…" with a progress indicator
6. On completion, merge step runs automatically
7. Editor refreshes with merge summary toast: "Generation complete — X blocks shared, Y variant-specific, Z conflicts need attention"
8. Conflicts (if any) are shown in a review panel; author resolves each one

### 5.3 Previewing a Variant in the Editor

1. Author opens the product document in canonical view
2. Sees all blocks with variant badges on scoped blocks
3. Clicks variant switcher in toolbar, selects "48V"
4. Canvas collapses to 48V-applicable blocks; hidden blocks show as thin rails
5. Author reads through the 48V view, checking coherence
6. Switches to "12V" — canvas updates
7. Returns to canonical view to make edits

### 5.4 Manually Scoping a Non-Spec-Linked Block

1. Author is in canonical view
2. Selects a safety warning block (ALL scope, no spec linkage)
3. Opens block context menu → "Variant scope"
4. Popover shows checkboxes for all variants, all checked
5. Author unchecks "12V" — this block will not appear in the 12V variant
6. Block now shows "48V, 24V" variant badge in canonical view

### 5.5 Publishing a Variant

1. Documentation lead opens "Variants" panel
2. Selects a variant, clicks "Publish"
3. Publication flow is identical to base document publication: approval check, snapshot creation, portal deployment
4. Variant's portal page becomes live at `/products/{slug}/{variant-slug}/`
5. Other variants are unaffected

### 5.6 Comparing Two Variants

1. Documentation lead opens document, selects "Compare variants"
2. Picker appears: select Variant A and Variant B
3. Side-by-side view renders with both variant documents
4. Divergent blocks are highlighted in both columns
5. Absent blocks show placeholder in the column where they don't appear
6. Lead reads through, notes any issues, returns to editor to address them

---

## 6. Design Decisions

| Decision | Rationale |
|---|---|
| Variants are always deltas from base, never independent records | Storing variant specs as independent records would allow them to diverge silently from the base. The delta model makes the relationship explicit and computable. The resolved spec is always derivable from base + delta — there is no way for a variant to accidentally lose its connection to the base product. |
| Full structural delta (add/remove components, not just scalar overrides) | Hardware variants frequently differ by more than field values. A 48V model may use a physically different transformer. An IP69K model may have a different housing component with its own spec sheet. Restricting variants to scalar overrides would force engineers to model structurally different components as the same component with different values — which is architecturally dishonest and produces misleading documentation. Full structural delta reflects how hardware actually varies. |
| Resolved spec computed at query time, not materialised | Materialising a resolved spec per variant means every spec change on the base product requires propagating the change to all variant materialisations. At query time, the resolved spec is always current by definition — there is nothing to propagate. For Arther's target market (SMB hardware companies with tens to low hundreds of variants per product), query-time computation with caching is appropriate. |
| Single document per product with variant-aware blocks | The alternative — one document per variant — creates a documentation maintenance problem identical to the problem variants are meant to solve. If the installation procedure changes, it must be updated in N documents. A single document with variant scope on blocks means the procedure is updated once. The variant-aware block model makes the delta visible without creating divergent copies. |
| Non-spec-linked blocks default to ALL scope with manual override available | The correct default is that content applies to all variants. A safety warning, a warranty statement, an introduction paragraph is correct for all variants unless the author decides otherwise. Defaulting to ALL requires one action to restrict; the reverse (defaulting to variant-specific) would require one action per variant for every prose block, which is impractical. The manual override escape hatch handles the minority of cases where ALL is wrong — variant-specific certifications, high-voltage warnings for specific models — without imposing complexity on the common case. |
| Spec-linked blocks automatically scoped via DERIVED mode | A block that renders a value from a component that doesn't exist in variant X cannot be correct for variant X. Automatic DERIVED scoping ensures this block is never shown in that variant without requiring the author to manually configure scope for every spec-linked block. The author override (switching to MANUAL) exists for edge cases where the automatic inference is wrong. |
| Generate per variant independently, then merge | Generating a variant-aware document in a single prompt — "here is the base spec, here are N variant deltas, produce a single variant-aware document" — requires the AI to reason across multiple resolved spec sets simultaneously. This increases hallucination risk and makes the output harder to validate. Generating per variant independently keeps each generation grounded in a single resolved spec set, identical to base product generation. The merge step is deterministic and auditable. |
| Merge anchor is spec linkage, not text similarity | Text similarity as a merge anchor is unreliable — two variants may generate the same sentence with different spec values embedded, making them textually dissimilar but structurally equivalent. Spec linkage is precise: two blocks that reference the same field ID are the same block with variant-specific values. The generator must preserve explicit spec linkages in its output for this to work. |
| Manual document generation trigger, not automatic on variant creation | Variant creation is a spec-level action; the engineer defining the variant's delta may not be the same person responsible for documentation, and the delta may not be complete at the moment of creation. Auto-generating on creation would produce documentation from an incomplete delta and notify documentation leads before the variant is ready for documentation. Manual trigger preserves the separation between spec definition and documentation workflow. |
| Canonical view as default editor mode, variant preview available via switcher | The author needs to see the complete document — all blocks, all scopes — to audit content and make structural decisions. A variant preview as the default would hide content from the author by default, which is wrong for authoring. Canonical view shows everything; variant preview is a deliberate mode switch for a specific purpose (checking coherence per variant). The switcher makes the transition explicit. |
| Portal: base URL serves variant picker, variants get canonical URLs | A single document URL with a query parameter (`?variant=48v`) makes it impossible to share a link to a specific variant reliably and is unfriendly to search indexing. Canonical per-variant URLs (`/{product}/{variant}`) are shareable, indexable, and follow the established pattern for locale and version switching on technical documentation sites. The base URL as a variant picker gives the customer a structured entry point when they don't know which variant they need. |
| Comparison view is block-level, not line-level diff | A line-level diff of prose (red/green word changes) is appropriate for code review, not for documentation review. Technical writers reviewing variant documents need to read both versions as documents — understanding whether each reads correctly — not parse diff hunks. Block-level highlight surfaces where variants diverge; the full content of each block is readable in both columns. |
| Staleness is variant-aware throughout | A block can be stale for one variant but current for another. Reporting staleness without variant context produces false alerts (a writer reviews a block that is stale in 48V but is reading the 12V view) and missed alerts (a block appears current in the canonical view because its 12V value is fresh, but its 48V value is stale). Variant context must propagate through every staleness indicator, review item, and coverage report in the product. |

---

## 7. Open Questions

| Question | Notes | Blocking? |
|---|---|---|
| Merge conflict resolution UX | Resolved. Two-path model: AI-generated conflicts are non-blocking and routed through the staleness dashboard with re-generate/keep-both/write-shared options. Human-edited conflicts are blocking for publish and resolved via a side-by-side panel with keep-mine/adopt-new/re-generate actions. Block-by-block resolution. See §4.8. | Resolved |
| Default variant behaviour on base URL | If a product has variants, the base URL can either redirect to the `is_default` variant immediately or show the picker. This should be a workspace-level publishing setting. The default for that setting needs a product decision — redirect is lower friction for products with an obvious primary SKU; picker is safer for products where the choice matters. | Can resolve during build |
| Variant slug uniqueness scope | Variant slugs must be unique within a product. Should Arther enforce uniqueness at the workspace level as well, to prevent `/products/psu-a/48v` and `/products/psu-b/48v` from causing portal routing ambiguity? The current URL structure (`{product-slug}/{variant-slug}`) means workspace-level uniqueness is not required, but the question is worth confirming with the portal routing implementation. | Can resolve during build |
| Maximum delta size advisory threshold | The "consider whether this should be a separate product" advisory triggers when the variant delta is large relative to the base spec. What is the right threshold — 30% of fields overridden? 50%? This is a UX calibration question that needs input from early users. The advisory is informational only; it never blocks. | Can resolve during build |
| SpecReconciler variant import schema | The External Sync feature will define how PLM/ERP part number variants map to Arther's `ProductVariant` and `VariantDelta` records. The variant data model here is designed to support this import, but the precise payload schema and field mapping logic will be defined in the External Sync feature document. This question is flagged as a dependency. | Dependency — flag for External Sync feature |
| Variant-aware snippet behaviour | Resolved. Spec tokens inside snippets resolve against the embedding document's product context at render time. For variant documents, this means the variant's field values — including variant-level overrides of the base product's fields — are used. Snippets are variant-aware through the document's product context, not through snippet-level configuration. No changes to snippet data structures are required. Confirmed in the Content Reuse feature document (v1.1). | Resolved |

---

## 8. Out of Scope

**Variant inheritance chains.** Variants inherit from the base product only — not from other variants. A "48V High-Temperature" variant is not a variant of the "48V" variant; it is a variant of the base product with a different delta. Chained inheritance would create complex dependency graphs that are hard to reason about and hard to render. If a product family genuinely needs hierarchical variant inheritance, it should be revisited as a separate capability after the base variant model is validated.

**Variant-level document types.** Every variant uses the same document types as the base product. A variant cannot add a document type that the base product does not have, or suppress a document type that it does. Document type configuration is at the product level, not the variant level.

**Variant-specific brand profiles.** Brand profiles (defined in the AI Document Generator feature) are applied at the document level, not the variant level. All variants of a product share the same brand profile. Regional certification variants that require different language or compliance styling are an edge case deferred to a future version.

**Automatic variant discovery from spec changes.** When a spec field is changed in a way that suggests a new variant (e.g., a discrete set of possible values added to an enum field), Arther does not automatically suggest creating variants. Variant creation is always a deliberate product management decision, not inferred from spec structure.

**Portal-facing variant comparison page.** The side-by-side comparison view is an internal authoring tool. A portal-facing page that lets customers compare two variants of a product is a meaningful future feature — it is the natural complement to the variant picker landing page — but it requires design work on portal information architecture that is out of scope here.

**Cross-product variant relationships.** A variant of Product A cannot reference a component from Product B's component graph. Variants operate within a single product's spec boundary. Cross-product component sharing is handled by the component library (a workspace-level shared resource), not by variant relationships.

---

*Arther — Product Variants: Feature Specification. Version 1.2, May 2026. Greenfield specification covering the delta-from-base spec model, full structural delta support (scalar override, component swap, component add/remove), query-time resolved spec computation, single variant-aware document with DERIVED/ALL/MANUAL block scope modes, canonical view and variant preview editor modes, generate-per-variant-then-merge AI generation strategy with spec-linkage merge anchor, variant-aware staleness tracking, portal URL structure with variant picker and canonical per-variant URLs, side-by-side block-level comparison view, manual generation trigger, and PLM import hook for External Sync integration. Intended as the authoritative design reference for this feature bucket, with dependencies on the Spec Database, AI Document Generator, Visual Block Editor, and Smart Spec Tracking features, and upstream implications for the Publishing Portal, Content Reuse, and External Sync feature documents.*
