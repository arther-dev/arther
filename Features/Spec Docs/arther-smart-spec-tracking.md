# Arther — Smart Spec Tracking: Feature Specification

**Version:** 1.3
**Date:** May 2026
**Status:** Specification complete — greenfield design
**Changes in v1.1:** Section 3.4 updated to introduce two-level domain ownership (category-wide default + product-specific override). Section 4.10 `DomainOwnershipConfig` updated with optional `product_id` and lookup precedence rules. Section 6 design decisions updated to include soft gate on publishing, two-level ownership rationale, and singular-owner-per-category decision. Section 7 open questions updated to reflect resolved blocking questions (publishing soft gate, multiple owners per category).
**Changes in v1.2:** Section 4.1 `BlockSpecReference` updated to include `variant_id` (Feature 9 — Product Variants) so that staleness detection and spec coverage reports are variant-aware. Section 4.9 `UserNotificationPreferences` removed — notification infrastructure and per-user preferences are owned by Feature 6 (Collaboration & Review). Smart Spec Tracking defines the notification events only; delivery is handled by the unified notification system. One new Design Decision added.
**Changes in v1.3:** Domain owner assignment UI resolved (previously blocking open question). Section 3.4 updated with full UI design: workspace-level domain ownership matrix in Settings, per-product ownership panel in Spec Database, component-level default category on `Component` entity (cross-ref Spec Database v1.5), field-level ownership visibility. Fallback chain confirmed: product-specific owner → workspace default owner → document owner → workspace admin.

---

## 1. Overview

### 1.1 Purpose

Smart Spec Tracking is the feature that makes Arther's documentation live rather than static. It detects when spec fields change in the Product Spec Database, automatically cascades those changes into every document that references them, routes review responsibilities to the right people, and manages the workflow from spec change to re-published portal page.

Without Smart Spec Tracking, Arther is a faster document creation tool. With it, Arther becomes the single living source of truth that prevents documentation debt from accumulating across an entire hardware product line. No competitor tracks the relationship between spec field changes and published document content at this level of precision.

### 1.2 The Core Model: Auto-Update and Review

Smart Spec Tracking is built on a single foundational distinction:

**Structured content auto-updates.** Inline spec tokens, Spec Table blocks, and Chart blocks are live views over spec data. When a field value changes, these update automatically across all documents — silently, without alerts, without human intervention. The system is confident there is nothing for a human to judge: the value is simply current.

**Prose needs human review.** When a token auto-updates inside a paragraph, the surrounding prose may no longer be accurate. A sentence written when the rated voltage was 36 V may make claims that are no longer true at 48 V. The system cannot judge this. It flags the affected section for human review and routes the flag to the right person.

This distinction keeps the alert surface narrow. The only things that trigger a review task are the things a human genuinely needs to look at — not every spec change, but the changes that affect written interpretation.

### 1.3 The Trust Model

Smart Spec Tracking is not a diff tool. It is a trust system. Its job is to make a technical writer, a domain engineer, and a customer confident that what is published is accurate.

The portal always serves the last manually approved version of a document. When specs change and auto-updates are applied to a document's working copy, the published snapshot does not change until a human reviews the affected sections, the document owner approves, and a new snapshot is explicitly published. The portal's content is never silently mutated.

This means Arther can make a claim no static PDF can: every document on the portal has been signed off by a human, and that sign-off has a timestamp.

### 1.4 Role in Arther

Smart Spec Tracking sits at the intersection of every other feature:

- **Upstream:** Product Spec Database — field changes are the trigger for everything in this feature
- **Upstream:** AI Document Generator — `BlockSpecReference` records created at generation time are the staleness anchors
- **Upstream:** Visual Block Editor — inline spec tokens defined there are the auto-update targets
- **Downstream:** Publishing Portal — the "needs review" state and published snapshot model determine what the portal serves
- **Downstream:** Collaboration and Review — the review assignment model and action dashboard defined here are the infrastructure that feature builds on

---

## 2. Who Uses This

### Product Engineers and Spec Owners

The triggering actors. They update spec field values in the Product Spec Database and see a pre-commit impact note showing how many documents will be affected. After saving, they see a `[!]` badge on the field indicating downstream document impact. They are the indirect users of this feature — they don't manage the review workflow, but their actions initiate it.

**Jobs they accomplish through this feature:**
- Know the documentation impact of a spec change before committing it
- Confirm whether a product-level scalar override is still intentional after the underlying component field changes
- See at a glance which of their spec fields are not referenced by any published document

### Domain Owners

Spec domain owners are the subject matter reviewers. A workspace admin assigns a domain owner per spec field category — Lead Electrical Engineer for electrical fields, Lead Mechanical Engineer for mechanical fields, Lead Compliance Engineer for certification fields. When specs in their domain change and affect document prose, they receive section-level review assignments.

**Jobs they accomplish through this feature:**
- Review flagged sections in the context of what changed, without opening every affected document
- Resolve prose conflicts introduced by auto-updated token values
- Sign off that the technical content of their domain's sections is accurate

### Document Owners

Document owners are the publication authority. Each document has one assigned owner — typically a technical writer or documentation lead. When all domain review items for their document are resolved, they approve and re-publish, creating a new published snapshot that updates the portal.

**Jobs they accomplish through this feature:**
- See which of their documents are in "needs review" state
- Approve documents for re-publication after spec changes have been reviewed
- Understand the full scope of what changed in a document before republishing

### Snippet Owners

The person responsible for a snippet in the Snippet Library. When a spec token inside a snippet auto-updates, the snippet owner receives a review assignment — not the owners of every document that embeds it. Review happens once at the source; all documents embedding the snippet benefit from a single resolved review.

### Workspace Admins

Configure the domain ownership model — which spec field categories map to which domain owners. This configuration is what makes automated review routing possible.

---

## 3. Core Concepts

### 3.1 The Two-Speed Update Model

Every spec field change triggers a cascade across all documents referencing that field. The cascade operates at two speeds, determined by the type of content being updated:

**Immediate auto-update (no human required):**
- Inline spec tokens in prose blocks — the `display_value` updates to the new field value, the `field_version_id` advances to the new version
- Spec Table block rows — the live value read from the spec database at render time reflects the new value automatically
- Chart blocks linked to table fields — the rendered chart reflects the new data automatically
- Table field value and row changes — auto-update, no flag

**Flagged for human review:**
- Prose blocks containing auto-updated tokens — the surrounding prose may be semantically affected by the value change; a section-level review item is created
- Scalar overrides on product-component relationships — the override value is not auto-updated; a review item is created for the spec owner who set the override

**Configuration flag only (not a review item):**
- Chart blocks whose referenced table field loses a column — the chart's configuration may reference a column that no longer exists; a configuration flag appears on the block in the editor

### 3.2 Working Copy and Published Snapshot

Every published document exists in two simultaneous states:

**Working copy** — the document as it exists in Arther's editor. Auto-updates are applied here immediately. This is what the technical writer sees when they open the block editor. The working copy is never directly visible to portal visitors.

**Published snapshot** — a frozen version of the document captured at the moment of the last manual publish. This is what the portal serves. Auto-updates do not mutate the published snapshot. The portal snapshot changes only when a document owner explicitly approves and publishes a new version.

Between a spec change and a new publish, the portal continues serving the previous approved snapshot. This is correct behaviour: the previous snapshot was signed off by a human. The new working copy has not been reviewed yet.

### 3.3 The "Needs Review" State

"Needs review" is a document state that applies exclusively to published documents. It indicates that auto-updates have been applied to the working copy and human review is required before a new snapshot can be published.

A draft document that receives auto-updates does not enter "needs review" — its working copy simply reflects the current spec values, which is normal editing behaviour for an unfinished document.

The "needs review" state is resolved when the document owner publishes a new approved snapshot. It is not resolved by completing section reviews alone — section reviews are prerequisites, but the final resolution is always a publish action.

### 3.4 Domain Ownership

Domain ownership is a two-level model that maps spec field categories to the engineers responsible for reviewing them, both workspace-wide and per product.

**Category-wide default** — a workspace admin assigns a fallback owner to a spec field category (Electrical, Mechanical, Performance, Environmental, Compliance). This owner receives review assignments for that category across all products unless a product-specific override exists.

**Product-specific override** — within a category, individual engineers can be assigned to specific products. In a mechanical engineering team, one engineer might own all mechanical spec reviews for a gear system product while another owns them for an enclosure product. Product-specific assignments take precedence over the category-wide default.

The review routing lookup chain is:
1. Is there a domain owner for this field category and this specific product? → Use them
2. Is there a workspace-wide default for this field category? → Use them
3. No configuration exists? → Fall back to the document owner

Domain ownership is entirely optional configuration. Workspaces that have not configured domain owners route all review items to the document owner by default, making the feature fully functional for small teams without requiring organisational structure to be modelled first.

Domain owners are always singular per category per product — never multiple. Clear individual accountability, no coordination ambiguity.

Domain owners review at the **section level** — they see the prose sections in affected documents that reference their domain's fields, review them against the change that triggered the flag, and sign off. They do not approve the document for publication — that authority belongs to the document owner.

**Field-to-category assignment** uses a component-level default with per-field override. Each `Component` in the Spec Database carries a `default_category` property (see Spec Database v1.5). When a new spec field is created on that component, its `category` is pre-filled from the component's default. Individual fields can override to a different category — for example, a "Housing Material" field on an otherwise Electrical component can be reassigned to Mechanical. This reduces per-field friction for the common case (most fields on a component share an engineering domain) while preserving flexibility for cross-discipline fields.

#### Domain Ownership UI

The domain ownership configuration surfaces in two places:

**Workspace Settings → Domain Ownership** — the workspace-level default ownership matrix. This is where admins assign default owners per category across the entire workspace. The surface is a table:

| Category | Default Owner | Products with Overrides |
|---|---|---|
| Electrical | James Chen | 2 of 12 |
| Mechanical | — (unassigned) | 0 of 12 |
| Thermal | Sarah Lin | 0 of 12 |
| Compliance | — (unassigned) | 0 of 12 |
| General | — (unassigned) | 0 of 12 |

Each row has a user picker for the default owner. The "Products with Overrides" count links to the expanded override view — clicking it shows which products have a product-specific owner that differs from the workspace default.

**Product → Spec Database → Domain Ownership panel** — a per-product ownership view accessible from each product's spec database section. This panel shows the resolved owner for each category on this specific product, indicating whether each comes from a workspace default or a product-specific override:

| Category | Owner | Source | Fields |
|---|---|---|---|
| Electrical | James Chen | Workspace default | 24 |
| Mechanical | Tom Wright | Product override | 8 |
| Thermal | Sarah Lin | Workspace default | 6 |

Clicking a category row opens an inline editor to set or clear the product-specific override. Clearing an override reverts to the workspace default. The "Fields" count links to a filtered view of all spec fields in that category on this product.

**Field-level visibility.** Each spec field in the database view displays a subtle metadata line: "Owner: James Chen (Electrical)" — showing the resolved owner and the category. This is read-only at the field level; ownership is changed via the category assignment on the field and the ownership matrix above, not by editing the field directly.

**Fallback chain** for routing review items when a spec field changes:
1. Product-specific domain owner for the field's category → use them
2. Workspace-level default owner for the field's category → use them
3. Document owner of the affected document → use them
4. Workspace admin → final backstop

This fallback chain is consistent with the conflict queue routing defined in the External Sync feature (Feature 9).

### 3.5 The Action Dashboard

The action dashboard is the central surface where every user sees the tasks that require their attention across all documents and all features. It is the home base for all action-required interactions in Arther — not just Smart Spec Tracking, but also comment mentions, approval requests, and brief fragment requests.

Items in the dashboard are ordered by date — most recent first. Items are scoped to the current user: a domain owner sees their section reviews, a document owner sees their publish approvals, a spec owner sees their override confirmations. No user sees items assigned to others.

Each item in the dashboard is one of a defined set of action types. For each type, the dashboard supports two interaction modes:

**Act here** — for decisions with sufficient context in the card itself. Scalar override confirmations are the primary example: the card shows the field name, old component value, new component value, and current override value. The spec owner acts directly on the card without opening any other surface.

**Review modal** — for decisions requiring the prose and diff context. Section review items open a full-page modal over the dashboard. The user stays on the dashboard; the modal is the focused work surface. Closing the modal returns them to their position in the dashboard queue.

### 3.6 The Review Modal

The review modal is the primary surface for section-level prose review. It is modelled on a git merge conflict view: changes that applied cleanly are shown as resolved, and places where prose may be semantically affected by a value change are shown as conflicts requiring resolution.

The modal has three zones:

**What changed** (left panel) — a list of spec field changes that triggered this review item. For each: field name, component name, old formatted value, new formatted value, who made the change, and when. This is the context the reviewer needs to understand what happened before looking at the prose.

**Section to review** (right panel) — the prose section from the document's working copy, with auto-updated tokens visible in their current chip-styled form. Prose adjacent to updated tokens is highlighted as a potential conflict.

**Actions** (footer) — Accept (mark section reviewed as-is), Edit prose (open lightweight inline editing surface for the section), Open full document (navigate to the block editor if more extensive changes are needed).

The lightweight editing surface within the modal supports inline text editing and spec token insertion. It does not expose the full block editor — restructuring blocks, adding media, or changing block types requires opening the full document. For most conflict resolutions, editing a sentence or two is sufficient and the modal surface is appropriate.

### 3.7 Spec Coverage Report

The spec coverage report lives in the Product Spec Database, as a view on each component's field list. It answers the question: which spec fields in this component are referenced by at least one published document, and which are not?

Coverage is computed from the set of `BlockSpecReference` records in the database. A field is "covered" if at least one `BlockSpecReference` references it in a published document. A field is "uncovered" if no such reference exists.

Uncovered fields are surfaced with a subtle indicator on the field row in the component view — not alarming, but visible. At the product level, a summary count is shown: "34 of 41 spec fields referenced in at least one published document."

The coverage report does not create action items or trigger assignments. It is a passive analytical view for documentation leads and spec owners who want to understand documentation completeness.

---

## 4. Data Model

### 4.1 BlockSpecReference

`BlockSpecReference` is defined in the Spec Database feature document and established at generation time by the AI Document Generator. It is the staleness anchor — the record of which field version a block was generated from. Smart Spec Tracking reads this table to identify affected documents and blocks when a field changes; it does not extend the schema.

For reference, the interface is:

```typescript
interface BlockSpecReference {
  block_id: string
  document_id: string
  field_id: string
  field_version_id: string      // staleness anchor — the version at generation time
  release_id?: string           // set if document was generated from a named release
  variant_id?: string           // set if this reference belongs to a variant document (Feature 9);
                                // null for base documents
  reference_type: 'generated' | 'manually_linked' | 'chart'
}
```

Staleness detection is a single database join — O(n) on blocks. The full query is specified in the Spec Database document.

**Variant-aware staleness:** When `variant_id` is set, the staleness query targets only blocks within that variant's documents, not across the entire document set. This means a spec field change that affects a variant document does not flag the base document as stale, and vice versa. The spec coverage report includes variant document references — a field is "covered" if it is referenced by any published document, including variant documents.

### 4.2 DocumentReviewState

Tracks the "needs review" state for published documents. Only published documents have a `DocumentReviewState` record — draft documents do not.

```typescript
interface DocumentReviewState {
  id: string
  document_id: string
  workspace_id: string
  state: 'current' | 'needs_review'
  triggered_at?: string             // when state last moved to needs_review
  triggered_by_field_ids: string[]  // which field changes triggered the current state
  last_published_at: string         // timestamp of the currently live published snapshot
  last_published_by: string         // who published the currently live snapshot
}
```

`state` transitions:
- `current` → `needs_review`: when any auto-update is applied to the document's working copy and the document is published
- `needs_review` → `current`: when the document owner publishes a new approved snapshot

### 4.3 FieldChangeDiff

A structured record of a spec field change, used to populate the "what changed" panel in the review modal and the scalar override review card. Created when a field version changes and referenced by the review items it generates.

```typescript
interface FieldChangeDiff {
  id: string
  field_id: string
  field_name: string
  component_id: string
  component_name: string
  old_version_id: string
  new_version_id: string
  old_display_value: string         // formatted value at old version: '36 V'
  new_display_value: string         // formatted value at new version: '48 V'
  changed_by: string                // user ID of the spec owner who made the change
  changed_at: string
}
```

### 4.4 SectionReviewItem

A review task assigned to a domain owner for a specific section of a specific document. Created when a spec field change in a given category affects prose blocks in a document section, and that category has a configured domain owner.

```typescript
interface SectionReviewItem {
  id: string
  workspace_id: string
  document_id: string
  section_name: string              // the document type section containing the flagged prose
  field_category: string            // which spec category triggered this item
  assigned_to: string               // domain owner user ID
  field_change_diffs: string[]      // FieldChangeDiff IDs that triggered this item
  affected_block_ids: string[]      // which prose blocks in this section contain updated tokens
  status: 'pending' | 'approved' | 'changes_requested'
  created_at: string
  resolved_at?: string
  resolved_by?: string
  notes?: string                    // optional note from the reviewer
}
```

When no domain owner is configured for a field category, the `assigned_to` is the document owner.

Multiple field changes in the same category affecting the same section within a short time window are consolidated into a single `SectionReviewItem` rather than generating separate items. The `field_change_diffs` array accumulates them.

### 4.5 ScalarOverrideReviewItem

A review task assigned to the spec owner who set a scalar override when the underlying component field changes. The override value is not auto-updated — this item exists to surface the conflict for human resolution.

```typescript
interface ScalarOverrideReviewItem {
  id: string
  workspace_id: string
  product_id: string
  component_id: string
  field_id: string
  field_name: string
  override_value: ScalarOverrideValue   // the current product-level override
  field_change_diff_id: string          // the FieldChangeDiff that triggered this item
  assigned_to: string                   // ScalarOverride.set_by
  status: 'pending' | 'confirmed' | 'updated' | 'removed'
  created_at: string
  resolved_at?: string
  resolved_by?: string
  resolution_notes?: string
}
```

Resolution actions:
- **Confirmed** — the override value is intentionally correct; no change made; item resolved
- **Updated** — the override value has been changed to a new value; item resolved
- **Removed** — the override has been deleted; the product now inherits the component default; item resolved

### 4.6 SnippetReviewItem

A review task assigned to the snippet owner when a spec token inside a snippet auto-updates. Review is done once at the snippet source; all documents embedding the snippet are covered by this single review.

```typescript
interface SnippetReviewItem {
  id: string
  workspace_id: string
  snippet_id: string
  snippet_name: string
  field_change_diffs: string[]          // FieldChangeDiff IDs that triggered this item
  affected_block_ids: string[]          // which blocks inside the snippet contain updated tokens
  assigned_to: string                   // snippet owner user ID
  status: 'pending' | 'approved' | 'changes_requested'
  embedding_document_ids: string[]      // documents that embed this snippet; notified on resolution
  created_at: string
  resolved_at?: string
  resolved_by?: string
}
```

When a `SnippetReviewItem` is resolved, all document owners whose documents embed the snippet receive a notification: "The [snippet name] snippet was reviewed and updated."

### 4.7 ChartConfigurationFlag

A light flag placed on a Chart block when its referenced table field loses a column the chart was configured to display. This is not a review item — it does not appear in the action dashboard or generate a notification. It surfaces as a visual indicator on the Chart block in the block editor.

```typescript
interface ChartConfigurationFlag {
  id: string
  block_id: string                  // the affected Chart block
  document_id: string
  field_id: string                  // the table field
  missing_column_id: string         // the column that was removed from the table field
  detected_at: string
  resolved_at?: string              // set when the chart is reconfigured
}
```

The flag clears when the document owner opens the block editor, reconfigures the Chart block to remove the reference to the missing column, and saves.

### 4.8 DashboardActionItem

The unified action item type that powers the action dashboard. Every review task — section reviews, override reviews, snippet reviews, document approval requests — surfaces as a `DashboardActionItem`. Items from the Collaboration and Review feature (comment mentions, approval requests) also surface here using the same interface.

```typescript
type DashboardActionItemType =
  | 'section_review'          // domain owner: review a document section after spec change
  | 'document_approval'       // document owner: review and republish after all sections cleared
  | 'override_review'         // spec owner: confirm scalar override is still intentional
  | 'snippet_review'          // snippet owner: review snippet prose after spec token update
  | 'placeholder_brief'       // product owner: write a missing Product Brief fragment
  | 'comment_mention'         // reviewer: respond to a block comment @mention
  | 'review_requested'        // reviewer: document has been sent for review

interface DashboardActionItem {
  id: string
  workspace_id: string
  type: DashboardActionItemType
  assigned_to: string               // user ID this item belongs to
  reference_id: string              // ID of the underlying item (SectionReviewItem.id, etc.)
  title: string                     // display title: 'Electrical Characteristics — Servo A'
  context: string                   // secondary detail: 'Rated Voltage changed: 36 V → 48 V'
  document_id?: string              // set for document-level items
  created_at: string                // dashboard is ordered by this field, descending
  status: 'pending' | 'resolved'
}
```

Items move to `status: 'resolved'` when the underlying review item is resolved. Resolved items are hidden from the default dashboard view but accessible via a "Show resolved" toggle.

### 4.9 Notification Events

Smart Spec Tracking defines the following notification event types. These events are delivered through the unified notification system owned by Feature 6 (Collaboration & Review) — user notification preferences, in-app notification centre, email delivery, and batching rules are all specified there.

| Event | Recipients |
|---|---|
| Spec field changed — documents affected | Owners of documents containing stale blocks |
| New section review item assigned | Assigned domain owner |
| Override review item created | Spec owner who set the override |
| Snippet review item created | Snippet owner |
| All section reviews resolved — document ready to publish | Document owner |
| Release-pinned document: new release available | Document owner |
| Snippet reviewed and updated | Owners of documents embedding the snippet |

Smart Spec Tracking does not own or duplicate the notification infrastructure. It emits events; Feature 6 routes and delivers them.

### 4.10 DomainOwnershipConfig

Workspace-level configuration mapping spec field categories to domain owners. Supports both workspace-wide defaults and product-specific overrides. Managed by workspace admins in Settings. When no mapping exists for a category and product combination, review items fall back through the lookup chain to the document owner.

```typescript
interface DomainOwnershipConfig {
  id: string
  workspace_id: string
  field_category: string            // e.g. 'electrical', 'mechanical', 'compliance'
  product_id?: string               // null = workspace-wide default for this category
                                    // set = product-specific override
  owner_user_id: string             // the domain owner for this category and product scope
  set_by: string
  set_at: string
}
```

Lookup precedence when routing a review item for a given `field_category` and `product_id`:
1. Record matching both `field_category` and `product_id` → product-specific owner
2. Record matching `field_category` with no `product_id` → category-wide default
3. No matching record → document owner fallback

For documents referencing specs from multiple products via manually inserted tokens, review routing uses the document's primary product to determine the domain owner. Cross-product token references do not generate separate review assignments for secondary products.

---

## 5. UX and Key User Flows

### 5.1 Pre-Commit Impact Note

When a spec owner edits a field value in the Product Spec Database and moves to save, an informational note appears adjacent to the Save button:

```
This change will trigger review in 12 documents.   [Save]
```

This is a count only — not a list, not a confirmation dialog, not a blocking gate. The spec owner is not required to acknowledge it. It exists to give them awareness of the blast radius before the cascade happens. If they want to see which documents are affected, the `[!]` badge on the field after saving links to that detail.

This note is computed from the current `BlockSpecReference` set — the same query used for staleness detection. It is shown only when the new value differs from the current value.

### 5.2 The Cascade on Field Save

When a spec field value is saved:

1. **Impact query** — Arther queries all `BlockSpecReference` records for this `field_id` across all documents in the workspace.

2. **Token auto-update** — For every document containing the field: all inline `InlineSpecTokenNode` records backed by this `field_id` have their `display_value` recomputed and `field_version_id` advanced to the new version. This happens in the working copy of every document — published or draft.

3. **Prose review item creation** — For each affected document: Arther identifies prose blocks containing updated tokens, groups them by document type section, resolves the domain owner for each section's field category, and creates `SectionReviewItem` records with the appropriate assignment.

4. **Document review state update** — For each affected published document: `DocumentReviewState.state` transitions to `needs_review`.

5. **Dashboard item creation** — A `DashboardActionItem` is created for each `SectionReviewItem` and for each domain owner assigned.

6. **Notification dispatch** — Users with `immediate_email: true` receive an email for each new dashboard item.

7. **Field badge** — The `[!]` badge appears on the changed field in the spec database, linking to the list of affected documents.

Draft documents receive token auto-updates (step 2) but do not generate `SectionReviewItem` records and do not have their document state updated (steps 3 and 4). Their working copy simply reflects the current spec values — correct behaviour for documents not yet published.

### 5.3 The Action Dashboard

The action dashboard is accessible from the main Arther navigation. It shows the current user's pending items, ordered by `created_at` descending.

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR DASHBOARD                              [Show resolved] │
├─────────────────────────────────────────────────────────────┤
│  SECTION REVIEW                                2 hours ago  │
│  Electrical Characteristics — Industrial Servo A            │
│  Rated Voltage changed: 36 V → 48 V                         │
│                                       [Review →]            │
├─────────────────────────────────────────────────────────────┤
│  OVERRIDE REVIEW                               5 hours ago  │
│  Rated Voltage override — Product A                         │
│  Component default: 36 V → 48 V  ·  Your override: 24 V    │
│                        [Confirm]  [Update]  [Remove]        │
├─────────────────────────────────────────────────────────────┤
│  SECTION REVIEW                               Yesterday     │
│  Compliance — Conveyor Drive B                              │
│  CE Voltage Rating changed: 36 V → 48 V                    │
│                                       [Review →]            │
├─────────────────────────────────────────────────────────────┤
│  DOCUMENT APPROVAL                           3 days ago     │
│  Industrial Servo A — Datasheet                             │
│  All sections reviewed · Ready to republish                 │
│                                      [Publish →]            │
└─────────────────────────────────────────────────────────────┘
```

**Override review cards** are resolved directly inline — no modal. The three action buttons (`Confirm`, `Update`, `Remove`) act on the `ScalarOverrideReviewItem` directly from the card. Selecting `Update` reveals an inline value field for entering the new override value before confirming.

**Section review cards** open the review modal on click of `[Review →]`.

**Document approval cards** appear when all `SectionReviewItem` records for a document are resolved. Clicking `[Publish →]` navigates to the document's publish flow, not a modal — publishing is a deliberate act that benefits from the full document context.

### 5.4 The Review Modal

Opening a section review card launches a full-page modal over the dashboard:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Electrical Characteristics — Industrial Servo A      [✕ Close]      │
├───────────────────────────┬──────────────────────────────────────────┤
│  WHAT CHANGED             │  SECTION TO REVIEW                       │
│                           │                                          │
│  Rated Voltage            │  The Industrial Servo A delivers         │
│  36 V → 48 V              │  peak efficiency at its rated [48 V]     │
│  Motor Controller v2.1    │  input, making it ideal for 24 V bus    │
│  J. Park · 2 hours ago    │  architectures requiring high-torque     │
│                           │  performance. ⚠                         │
│  Input Range              │                                          │
│  18–54 V DC → 24–60 V DC  │  Continuous Input Range: [24–60 V DC]   │
│  Motor Controller v2.1    │  Peak Input: [60 V]                      │
│  J. Park · 2 hours ago    │                                          │
│                           │  ✓  Supply Voltage updated: 36 V → 48 V │
│                           │  ✓  Input Range updated automatically    │
│                           │                                          │
├───────────────────────────┴──────────────────────────────────────────┤
│  [Approve section]   [Edit prose]   [Open full document ↗]           │
└──────────────────────────────────────────────────────────────────────┘
```

**Clean merges** — token updates where the surrounding prose is unambiguously unaffected — are listed with `✓` checkmarks at the bottom of the section panel. No action required.

**Conflicts** — prose adjacent to an updated token that may be semantically affected — are highlighted with `⚠` markers inline in the prose. In the example above, the sentence claiming the product is "ideal for 24 V bus architectures" is now potentially inaccurate given a 48 V rated input.

**Approve section** — marks the `SectionReviewItem` as approved without editing. Appropriate when the reviewer reads the prose and judges it still accurate.

**Edit prose** — reveals a lightweight inline editing surface over the right panel. The reviewer can edit the conflicted sentence directly, insert or remove tokens, and save. On save, the `SectionReviewItem` is marked approved.

**Open full document** — closes the modal and navigates to the block editor, opening the document at the flagged section. Used when the conflict requires more than prose-level editing — restructuring content, adding blocks, or changing information architecture.

When all `SectionReviewItem` records for a document are resolved, a `document_approval` `DashboardActionItem` is created for the document owner.

### 5.5 Snippet Review Flow

When a spec token inside a snippet auto-updates:

1. A `SnippetReviewItem` is created and assigned to the snippet owner
2. A `DashboardActionItem` appears for the snippet owner
3. The review modal for a snippet item shows the snippet's prose (not any document's prose) with the updated token in context
4. The snippet owner reviews, edits if needed, and approves
5. All document owners whose documents embed the snippet receive a notification: "The [snippet name] snippet was reviewed and updated"
6. Document owners whose documents are in `needs_review` state remain responsible for re-publishing; snippet review does not automatically clear document-level review state

### 5.6 Release-Pinned Documents

Documents generated from a named product release are pinned to that release's field version snapshot. When field values change in "latest" — after the release was cut — release-pinned documents are not affected. Their `BlockSpecReference` records point to the release's `field_version_id` values, which are immutable. No tokens update, no review items are created.

The portal shows a "based on [release tag]" label on every release-pinned document. When a new release is cut that contains field changes, a notification is surfaced to the document owner: "A new release — v2.2 — is available. Consider updating this document."

This notification does not create a `DashboardActionItem` — it is informational. Updating a document to a new release is a deliberate product decision, not an automated workflow.

### 5.7 Spec Coverage Report

The coverage report lives within the Product Spec Database, on each component's field list view. A "Coverage" tab alongside the field list shows:

```
Motor Controller v2.1 — Spec Coverage

  ▼ ELECTRICAL                                     5 of 6 covered
    Rated Voltage         36 V        ✓  Referenced in 3 documents
    Input Range        18–54 V DC     ✓  Referenced in 3 documents
    Rated Current          8.5 A      ✓  Referenced in 2 documents
    Peak Current            12 A      ✓  Referenced in 1 document
    Efficiency            [table]     ✓  Referenced in 2 documents
    Inrush Current         22 A       ○  Not referenced in any document

  ▼ MECHANICAL                                     3 of 3 covered
    Mass                  1.2 kg      ✓  Referenced in 3 documents
    ...
```

`○` fields — those not referenced in any published document — are the coverage gaps. Clicking a `○` field shows which document types would typically include this field, based on the Document Type section-to-category mappings, giving the documentation lead a starting point for where to add coverage.

At the product level, the sidebar shows a summary coverage count:

```
Industrial Servo A
Coverage: 34 of 41 spec fields referenced
```

Coverage is computed at read time from `BlockSpecReference` records — it is not stored separately.

---

## 6. Design Decisions

| Decision | Rationale |
|---|---|
| Auto-update for structured content, flag for prose | The distinction is not arbitrary — it maps precisely onto what the system can and cannot judge. A token value is either current or it isn't; the system can resolve this without human input. Whether prose is still semantically accurate after a value change is a judgment call only a human can make. Collapsing the two into a single "stale" model would either over-notify (creating alert fatigue) or under-notify (missing genuine accuracy problems). |
| Portal always serves last approved snapshot | Auto-updating the portal on every spec change would mean customers read content that has not been signed off. The approved snapshot model means the portal makes a credible claim: this document was reviewed and approved by a human. No static PDF can make the same claim with a timestamp. |
| "Needs review" applies to published documents only | Draft documents are works in progress. Spec changes updating tokens in a draft are normal editing flow — the document hasn't been approved for anything yet. Flagging drafts would create noise without meaningful signal. The "needs review" state exists to surface a gap between what's live and what's current, which only applies to published documents. |
| Domain owner vs. document owner separation | The person qualified to judge whether electrical parameters are accurately described is an electrical engineer, not the technical writer who owns the document. Routing section review to domain experts produces better reviews. Routing publication authority to the document owner preserves editorial accountability. The two roles serve different purposes and the same person should never be required to hold both for correctness. |
| Two-level domain ownership (category default + product override) | Engineering teams are organised around products, not just disciplines. A single mechanical lead reviewing all mechanical content across an entire product catalogue does not reflect how hardware companies actually work. Product-specific overrides allow each engineer to own the products they are responsible for, while the category-wide default provides coverage for products with no explicit assignment. |
| Domain owners are always singular per category per product | If multiple people can receive the same review item, responsibility becomes ambiguous — does both need to approve, or just one? Either answer creates problems: dual approval risks deadlock; either-one approval reduces accountability. One owner, clear responsibility, no coordination overhead. Multiple owners is deferred until there is demonstrated need at scale. |
| Soft gate on publishing with pending section reviews | A hard gate — cannot publish until all domain reviews are resolved — creates a dependency problem. A single unavailable reviewer blocks publication of time-sensitive documents. A soft gate with explicit acknowledgement and audit trail preserves the intent of domain review (accountability, visibility) while keeping the document owner in control. The override is logged; for regulated environments, that record is sufficient. |
| Snippet review at source, not per embedding document | A snippet's content is owned in one place. Reviewing it in 20 documents for the same underlying content is redundant work and does not improve accuracy — the prose is identical in every embedding. Review once at the source; notify embedding document owners. This is consistent with the transclusion model: ownership is centralised, usage is distributed. |
| Domain ownership falls back to document owner | Not every workspace has distinct domain leads. A five-person hardware startup may have one engineer reviewing all sections. Requiring domain ownership configuration as a prerequisite would make the feature unusable for smaller teams. The fallback ensures the feature works out of the box while the richer routing model is available when the organisation warrants it. |
| No severity tiers for review items | Severity tiers require classification — either manual (spec owner labels every change as critical/minor) or automatic (system infers from field type or value delta). Manual classification adds friction to spec editing. Automatic inference is unreliable: a 5% efficiency improvement and a safety-critical voltage change both look like scalar field changes. Severity tiers introduce complexity without a reliable signal to drive them. The narrow "prose only" scope of review items already filters out most noise. |
| Pre-commit impact note is informational, not a gate | Engineers should not be slowed down from updating specs by confirmation dialogs. The note gives them situational awareness — 12 documents will be affected — without requiring them to justify the change or understand the documentation system. Blocking or confirmation-requiring warnings on spec saves would erode the trust of the engineering users who are Arther's secondary actors. |
| Bulk consolidation of same-category changes into one review item | Multiple field changes in the same category affecting the same document section within a short window are not independent events from the reviewer's perspective. Consolidating them into a single review item with a multi-item diff reduces dashboard noise without losing information — the `field_change_diffs` array contains all the changes. |
| Chart column removal surfaces as configuration flag, not review item | A missing column is a configuration problem — the chart references something that no longer exists — not a content accuracy problem. It does not require a domain expert's judgment; it requires the document owner to reconfigure the chart. Surfacing it as a block-level flag in the editor (visible when the document is opened) is proportionate to its severity and routes to the right person. |
| Release-pinned documents are not affected by latest changes | A document generated from v2.1 is documenting v2.1. Changes to v2.2 or latest are categorically not relevant to that document's accuracy. The release model exists precisely because hardware companies run multiple versions in the field simultaneously. Auto-cascading latest changes into release-pinned documents would undermine the entire point of releases. |
| Spec coverage report lives in the spec database, not the dashboard | Coverage is a spec-first question — you're looking at your data and asking what isn't documented. It belongs next to the data, not in an action-oriented workflow surface. The dashboard is for tasks; the coverage report is for analysis. |
| Numbers-with-units detection deferred to v2 | Flagging all numeric values in prose as potential unlinked tokens would produce too many false positives — step numbers, figure references, dates, counts. Numbers followed by a unit from the unit registry are a much tighter signal, but detecting them reliably requires prose scanning logic that warrants its own scoping. The v1 coverage report surfaces uncovered fields, which gives documentation leads a starting point for identifying gaps without requiring prose scanning. |
| Notification infrastructure owned by Feature 6, not here | Building a separate notification preference model and delivery pipeline in this feature would produce two divergent systems — one for collaboration events, one for staleness events — with different interfaces, different preference UIs, and different inconsistencies. The unified model defined in Feature 6 is the correct home. This feature defines the events; Feature 6 delivers them. |
| Staleness queries are variant-scoped via variant_id | A spec field change in a base document should not flag variant documents as stale unless the variant document's blocks reference the same field. The `variant_id` on `BlockSpecReference` enables the staleness query to be scoped correctly to each document independently, preventing cross-variant false positives. |

---

## 7. Open Questions

| Question | Notes | Blocking? |
|---|---|---|
| Domain owner assignment UI | Resolved. Two surfaces: (1) Workspace Settings → Domain Ownership matrix for workspace-level default owners per category; (2) Product → Spec Database → Domain Ownership panel for per-product overrides. Component-level `default_category` pre-fills field categories (Spec Database v1.5). Field-level ownership visible as read-only metadata. Four-step fallback chain: product-specific owner → workspace default → document owner → workspace admin. See §3.4. | Resolved |
| Review item consolidation time window | Same-category field changes within a short window are consolidated into one review item. How long is the window — seconds, minutes, hours? Too short and rapid successive spec edits generate separate items; too long and the consolidation delays the start of review. | Can resolve during build |
| Document owner notification when sections are cleared | When all section reviews for a document are resolved and the `document_approval` item is created, does the document owner receive an immediate email notification regardless of their `immediate_email` preference? Publication-readiness feels like a notification worth always sending, but this needs a policy decision. | Can resolve during build |
| Coverage report refresh frequency | Coverage is computed at read time from `BlockSpecReference` records. For a workspace with many documents and many spec fields, this query may be expensive. Is on-demand computation sufficient, or does the coverage report need a cached/materialised view that refreshes on a schedule? | Can resolve during build |
| Interaction with Collaboration and Review | The `DashboardActionItem` type includes `comment_mention` and `review_requested` items from the Collaboration and Review feature. The dashboard interface and data model defined here must accommodate those item types without knowing their full detail. The Collaboration and Review feature doc will need to align its item types with the `DashboardActionItemType` union defined here. | Dependency — flag for Collaboration and Review feature |

---

## 8. Out of Scope

**Unlinked prose value detection.** Detecting numeric values in prose that should be spec-linked tokens but aren't — the manually typed "8.5 A" that silently diverges from the spec database — requires prose scanning logic against the unit registry. The heuristic (numbers followed by recognised units) is defined and intended for v2, but the detection complexity warrants its own scoping. The v1 coverage report surfaces uncovered fields, giving documentation leads a starting point.

**Bulk regeneration.** The prior design concept of bulk-regenerating multiple stale blocks simultaneously is superseded by the auto-update model. Token values update automatically; prose is flagged for review on a section-by-section basis. There is no "regenerate all stale blocks" action because the blocks that require human attention are precisely the ones where automation is inappropriate.

**Staleness severity tiers.** No classification of field changes into critical/minor/informational tiers. The review item scope — prose blocks only — already filters the signal to what genuinely requires attention. Adding severity tiers requires either unreliable automatic inference or friction-adding manual classification.

**Automatic portal unpublishing on spec change.** When specs change and a document enters "needs review," the portal continues serving the last approved snapshot. Auto-unpublishing a live document because a spec changed would be a worse outcome than serving the previous approved version — it removes a customer-facing resource that was accurate when it was published.

**Cross-workspace spec tracking.** Spec changes in one workspace affecting documents in another workspace. Arther's workspace model is self-contained. Cross-workspace content reuse and tracking is a distinct and complex feature that belongs on a long-term roadmap, not in this feature.

**Scheduled or batched cascade processing.** All cascades are applied immediately when a field is saved, not queued for batch processing. For the document counts likely in Arther's SMB target market, synchronous cascade processing is appropriate. If workspace size grows to a point where cascade processing needs queuing, that is a scaling decision for infrastructure, not a feature design decision.

---

*Arther — Smart Spec Tracking: Feature Specification. Version 1.3, May 2026. Greenfield specification covering the two-speed auto-update model, working copy vs. published snapshot architecture, "needs review" document state, domain ownership and review routing, action dashboard with act-here and git-diff review modal interaction patterns, scalar override review flow, snippet review at source, release-pinned document behaviour, spec coverage report, pre-commit impact note, variant-aware BlockSpecReference staleness, and notification event taxonomy (delivery via Feature 6). Intended as the authoritative design reference for this feature bucket, downstream of the Spec Database, AI Document Generator, and Visual Block Editor, and upstream of the Publishing Portal and Collaboration and Review feature documents.*
