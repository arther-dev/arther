# Arther — Content Reuse: Feature Specification

**Version:** 1.1
**Date:** May 2026
**Status:** Specification complete — greenfield design

**Changelog:**
- **v1.1** — Replaced standalone `SnippetOverrideNotification` interface with notification event taxonomy (delivery owned by Feature 6); resolved open question on snippet behaviour in variant documents

---

## 1. Overview

### 1.1 Purpose

Content Reuse is the feature that allows authors to define reusable blocks of content once and embed them across many documents, without sacrificing consistency or traceability. For hardware documentation teams, the cost of inconsistency is not aesthetic — it is regulatory. An ESD warning that differs between a datasheet and an installation manual is a compliance liability. A product specification summary that gets manually updated in some documents but not others is a documentation debt that compounds with every new SKU.

Content Reuse solves this by making live transclusion the default reuse mechanism. When a block is defined as a snippet, every document that embeds it shows the same content from a single authoritative source. Edits to the source propagate everywhere at once. Deviations are tracked, not silently permitted.

### 1.2 The Block Library

The block library is the single home for all reusable content in Arther. There is no separate snippet system. The library contains two types of items, distinguished by a single property:

**Templates** — reusable structure, inserted as an independent copy. A template might be a pre-configured Spec Table layout, a callout block with a standard format, or a step-wizard shell. The value is the shape, not the content. Templates are copy-on-insert: once placed in a document, the block is independent. There is no relationship back to the library item.

**Snippets** — reusable content, inserted as a live reference. A snippet might be a regulatory compliance statement, a standard warranty paragraph, or an ESD warning. The value is the content itself, which must remain consistent wherever it appears. Snippets use live transclusion: documents embed a reference to the source, not a copy. Edits to the source propagate to all embeds automatically.

This distinction keeps the architecture simple. There is one library, one management surface, and one insertion flow — but the two item types behave fundamentally differently after insertion.

### 1.3 The Override Model

Live transclusion alone would make snippets too rigid. Legitimate deviations exist — a regional variant of a compliance statement, a product-specific modification to a standard introduction. Arther supports these through a document-level override model.

A document owner can apply an override to any embedded snippet. The override replaces the snippet's content in that specific document, but it does not sever the relationship with the source. The source is still tracked underneath. If the source snippet changes after an override is applied, the document owner is alerted that the source has changed and must confirm whether their override still applies.

This is the CSS inheritance model applied to documentation: you can override at a lower level without losing the relationship to the level above. No document ever silently drifts from a canonical source — divergences are always tracked and always visible.

### 1.4 Role in Arther

Content Reuse connects to every other feature in the product:

- **Upstream:** AI Document Generator — the block source taxonomy (spec-referenced, brief-referenced, placeholder) established there governs how document duplication works in this feature
- **Upstream:** Visual Block Editor — the block schema and block types defined there are the containers that snippets and templates are built from
- **Upstream:** Smart Spec Tracking — spec tokens inside snippets auto-update via the same mechanism as tokens in regular blocks; stale prose in snippets surfaces as library-level flags that propagate to all embedded documents
- **Downstream:** Publishing Portal — snippet override state and staleness flags are part of the document state that gates publication
- **Downstream:** Collaboration & Review — the notification model defined here (override alerts, stale prose alerts) feeds into the action dashboard defined in that feature

---

## 2. Who Uses This

### Technical Writers and Documentation Authors

The primary creators and consumers of reusable content. Authors insert snippets from the block library into documents, rely on live transclusion to keep compliance content current without manual updates, and apply document-level overrides when a specific document legitimately needs to deviate from the standard content.

**Jobs they accomplish through this feature:**
- Insert a standard compliance block into a new document without re-authoring it
- Duplicate an existing document as a starting point for a new product's documentation
- Apply a document-level override when a product-specific deviation is required

### Compliance and Regulatory Managers

The owners of compliance-critical snippets. They define the canonical text for ESD warnings, CE compliance statements, regulatory boilerplate, and similar content that must be identical across a documentation set. They are notified when any document overrides a snippet they own, and they review and resolve stale prose flags at the source.

**Jobs they accomplish through this feature:**
- Update a regulatory statement once and have it propagate to all documents automatically
- Know immediately when any document has deviated from the canonical compliance text
- Resolve a stale prose flag in the library, resolving it for all embedded documents at once

### Document Owners

A document owner is the publication authority for a specific document. In the Content Reuse feature, document owners are the only users who can apply overrides to embedded snippets. They are notified when a source snippet they have overridden changes, and they decide whether their override still applies.

**Jobs they accomplish through this feature:**
- Override an embedded snippet when their document requires a legitimate deviation
- Respond to an alert that a source snippet has changed while their override is active
- Resolve a stale prose flag in their document when the snippet owner has not yet done so at the source

### Workspace Admins

Manage the block library — organising items, setting snippet ownership assignments, and monitoring override state across the workspace.

---

## 3. Core Concepts

### 3.1 Snippets Use Live Transclusion

When a snippet is embedded in a document, no copy of the content is created in that document. The document stores a reference to the source snippet in the block library. At render time, the document reads the snippet's current content from the library and displays it.

The implication: editing a snippet in the block library immediately updates every document that embeds it. There is no "push update" step — transclusion is the display mechanism, not a sync operation.

### 3.2 Snippets Are Block Sequences

A snippet is a named, ordered sequence of one or more blocks. A snippet containing a single paragraph block is valid. A snippet containing an H2 heading, two paragraph blocks, and a Spec Table block is equally valid — and is treated as a single atomic unit for the purposes of insertion, override, and versioning.

When a snippet sequence is embedded in a document, the blocks render inline as if they were native document blocks. The sequence behaves as a single reusable unit: it is overridden as a unit, versioned as a unit, and rolled back as a unit. Individual blocks within the sequence cannot be independently overridden or detached.

### 3.3 The Override Model

An override is a document-level replacement of a snippet's content. It is not a copy — the source relationship is maintained underneath.

**Override states:**

**Live** — the document is showing the source snippet content exactly. Auto-updates apply automatically. This is the default state for all embedded snippets.

**Overridden** — the document is showing the document owner's custom content instead of the source. The source is still tracked. Future changes to the source trigger an alert rather than an auto-update.

**Source changed while overridden** — the source snippet was edited after the override was applied. The override content remains visible in the document, but a flag is shown: "The source snippet has changed since this override was created. Review the update and confirm whether your override still applies."

The document owner must explicitly resolve the flag — either by confirming the override still applies, updating the override content to reflect the source change, or removing the override to revert to live transclusion.

### 3.4 Who Can Override

Only the document owner can apply, edit, or remove an override. Users with edit permissions on a document cannot override snippets — this is a document owner–only action. This prevents contributors from accidentally or inadvertently creating undocumented divergences from canonical compliance content.

### 3.5 Override Notifications

The snippet owner is notified whenever a document owner creates an override of their snippet. The notification identifies the document, the document owner, and the timestamp. The snippet owner cannot block or revert the override — notification is informational. It gives compliance managers visibility over which documents are running custom versions of their content.

### 3.6 Snippets and Spec Fields

A snippet can contain inline spec tokens, Spec Table blocks, Chart blocks, or any other block type that supports spec references. Spec tokens inside snippets resolve contextually — at render time, the token resolves against the spec field value for the product the embedding document is linked to.

This means a single "Electrical Summary" snippet can serve every product's datasheet, with each document rendering the correct spec values for its product automatically.

**Staleness behaviour for snippets:**

Spec tokens inside snippets auto-update via the same mechanism as tokens in regular blocks. When a spec field value changes, the token's display value updates automatically across all documents embedding the snippet. No human action required.

Prose in a snippet that was written around spec values — but does not contain an explicit token — can become semantically stale if a referenced value changes significantly. When this occurs, a stale prose flag is raised on the snippet in the block library. The flag surfaces on every document that embeds the snippet as a visible staleness indicator.

Both the snippet owner and the document owner can resolve a stale prose flag:
- **Snippet owner resolves at the source** — editing the snippet prose in the library resolves the flag everywhere at once. All embedded documents clear their staleness indicator.
- **Document owner resolves locally** — the document owner reviews the prose in the context of their document and marks it as reviewed. This implicitly creates a document-level override, treating the current prose as intentionally accepted for that document. The snippet owner is notified, as with any override.

### 3.7 Snippet Versioning and Rollback

Every edit to a snippet creates a new version in the block library's version history. Rollback to any prior version is supported.

Rolling back a snippet propagates the rolled-back content to all live-transcluded documents automatically — the same as a forward edit. Documents in override state are unaffected (their override content is still shown) but receive an alert: "The source snippet has been updated. Review the change and confirm whether your override still applies." The notification and resolution flow is identical to a forward edit.

### 3.8 Snippet Deletion

A snippet cannot be deleted from the block library while it has active embeds. The delete action is blocked, and the library shows the count of documents currently embedding the snippet. The snippet owner must either reassign those documents to a different snippet, remove the embeds manually, or convert the embeds to independent blocks before deletion is permitted.

This prevents broken references and ensures no document silently loses content.

### 3.9 Nested Snippets

Snippets cannot contain other snippets. A snippet's blocks are authored directly in the library — there is no mechanism to embed one snippet inside another. This constraint is intentional at launch: nested transclusion creates dependency chains that significantly complicate versioning, rollback, and staleness propagation. The constraint may be revisited in a future version.

### 3.10 Templates Are Copy-On-Insert

Templates are the second type of block library item. When a template is inserted into a document, a full independent copy of the block (or block sequence) is placed in the document. There is no link back to the library item. Edits to the template after insertion do not affect documents that have already inserted it.

Templates exist to save setup time, not to maintain consistency. A pre-configured Spec Table layout, a standard callout block format, or a step-wizard shell are appropriate candidates for templates. Content that must stay consistent across documents is a snippet, not a template.

---

## 4. Data Model

### 4.1 LibraryItem

The block library is represented as a collection of `LibraryItem` records.

```typescript
interface LibraryItem {
  id: string
  workspace_id: string
  name: string
  type: 'snippet' | 'template'
  owner_id: string                    // user ID of the snippet/template owner
  blocks: Block[]                     // ordered sequence of one or more blocks
  version_history: LibraryItemVersion[]
  created_at: string
  updated_at: string
  embed_count: number                 // denormalised count of active embeds; blocks deletion if > 0
}

interface LibraryItemVersion {
  version_id: string
  library_item_id: string
  blocks_snapshot: Block[]            // full snapshot of block content at this version
  created_by: string
  created_at: string
  change_note?: string
}
```

### 4.2 SnippetEmbed

When a snippet is inserted into a document, a `SnippetEmbed` record is created. This is the live reference — the mechanism that makes transclusion work.

```typescript
interface SnippetEmbed {
  id: string
  document_id: string
  library_item_id: string
  position: number                    // insertion position in the document's block sequence
  state: 'live' | 'overridden' | 'source_changed'
  override_blocks?: Block[]           // populated only when state is 'overridden' or 'source_changed'
  override_created_at?: string
  override_created_by?: string        // must be the document owner
  source_version_at_override?: string // library_item version ID at the time of override creation
  stale_prose_flag: boolean           // true if a stale prose flag is active on the source snippet
  stale_prose_resolved_locally: boolean // true if the document owner has resolved locally
}
```

### 4.3 Notification Events

Content Reuse emits notification events for delivery by Feature 6 (Collaboration & Review), which owns all notification infrastructure — delivery channels, read-state tracking, and user notification preferences. This feature defines event types and recipients only.

| Event type | Recipient | Trigger |
|---|---|---|
| `snippet.override_created` | Snippet owner | A document owner creates a new override on an embedded snippet |
| `snippet.source_changed_while_overridden` | Document owner | The source snippet is edited while the document has an active override |
| `snippet.stale_prose_flagged` | Snippet owner | A stale prose flag is raised on a snippet in the block library |
| `snippet.stale_prose_resolved_locally` | Snippet owner | A document owner resolves a stale prose flag locally, creating an implicit override |

### 4.4 Duplication Record

When a document is duplicated for a new product, a `DuplicationRecord` captures the outcome for auditability.

```typescript
interface DuplicationRecord {
  id: string
  source_document_id: string
  new_document_id: string
  target_product_id: string
  blocks_resolved: number             // spec-referenced blocks that re-resolved successfully
  blocks_placeholdered: number        // brief-referenced blocks converted to placeholders
  blocks_carried_over: number         // placeholder blocks carried as-is
  created_by: string
  created_at: string
}
```

---

## 5. Feature Behaviour

### 5.1 Creating a Snippet — Promotion Flow

The most natural way to create a snippet is to promote existing content from a document. The flow:

1. The author selects one or more whole blocks in the block editor by clicking block handles. Partial text selection within a block is not supported — promotion is block-level only. If the author wants to promote only part of a paragraph, they split the paragraph first.
2. With blocks selected, a "Save to Library" option appears in the block action menu.
3. The author chooses **Snippet** (live, consistent content) or **Template** (copy-on-insert structural starter).
4. The author names the library item and assigns an owner (defaults to themselves).
5. On confirmation, the selected blocks are moved to the library. The document's blocks are replaced by a `SnippetEmbed` reference — the document still shows the same content, but it is now live-transcluded from the library.

### 5.2 Creating a Snippet — Direct Authoring Flow

Snippets and templates can also be created directly in the block library without starting from a document:

1. Author navigates to the block library and clicks "New Item."
2. Chooses type (snippet or template), names it, and assigns an owner.
3. Authors block content directly in the library's block editor — the same editor surface used in documents.
4. On save, the item is available for insertion into any document.

### 5.3 Inserting a Snippet or Template

From within the block editor, the author opens the block library panel and browses or searches for a library item. Items display their name, type (snippet or template), owner, and embed count (snippets only).

On insertion:
- **Template** — a full independent copy of the block sequence is placed at the cursor position. The copy is immediately editable. No link to the library item is maintained.
- **Snippet** — a `SnippetEmbed` reference is created. The snippet's blocks render inline in the document. The blocks are visually distinguished as live content (see Section 5.5).

### 5.4 Applying a Document-Level Override

A document owner can override any embedded snippet in a document they own:

1. The document owner clicks the snippet's action menu within the document editor.
2. They select "Override for this document." A confirmation dialog shows the name of the snippet and the number of other documents that will be unaffected by this action.
3. On confirmation, the override editor opens in place. The current snippet content is pre-populated as the starting point for the override.
4. The document owner edits the content and saves. The `SnippetEmbed` state transitions to `overridden`.
5. The snippet owner receives an override notification.

Override editing uses the same in-place block editor surface as regular document editing — the author does not leave the document.

### 5.5 Snippet Visual Signalling

Embedded snippets must be visually distinguishable from regular document blocks. The signal is prominent but not obtrusive:

- A distinct left-border colour on every block in the embedded sequence (uses the library accent colour from the design system, separate from the spec-reference token colour)
- A snippet icon and the snippet name displayed in the top-left of the first block in the sequence, visible at all times
- A hover state on the snippet icon reveals the embed count ("embedded in 12 documents") and the snippet owner's name

When the document owner enters edit mode on a snippet (clicks into it), a full-width warning banner appears above the snippet: **"You are editing a snippet. Changes will apply to all 12 documents that embed it."** The banner persists throughout the editing session on that snippet.

For overridden snippets, the left-border colour shifts to indicate override state, and the snippet label shows "Overridden" in place of the snippet name.

### 5.6 Source Changed While Overridden

When a snippet is edited in the library and one or more documents have active overrides:

1. The overridden `SnippetEmbed` records transition to `source_changed` state.
2. A flag appears in the document: "The source snippet has been updated since this override was created. Review the update and confirm whether your override still applies."
3. The flag surfaces in the document owner's action dashboard as a required action.
4. The document owner reviews the source change (the dashboard shows a diff of the old and new source content) and takes one of three actions:
   - **Confirm override** — marks the override as still intentional. The `SnippetEmbed` transitions back to `overridden`. The document owner's override content is unchanged.
   - **Update override** — opens the override editor, pre-populated with their current override content, alongside the new source content for reference. The owner updates their override and saves.
   - **Remove override** — reverts the embed to live transclusion. The embed transitions to `live` and the source content is shown.

### 5.7 Stale Prose in Snippets

When a stale prose flag is raised on a snippet (triggered by a spec field change that affects prose written around a token value):

1. The flag appears on the snippet in the block library, visible to the snippet owner.
2. A staleness indicator appears on every document embedding the snippet. The indicator is visually consistent with the stale prose indicator on regular blocks, but labelled as originating from the snippet.
3. The snippet owner's action dashboard surfaces a review task — identical in format to a regular section-level review task from Smart Spec Tracking.

**Resolution by snippet owner:** The owner reviews and edits the snippet prose in the library. On saving, the library-level flag clears. All document-level staleness indicators clear automatically. No action required from any document owner.

**Resolution by document owner:** The document owner reviews the prose in their document's context and marks it as locally accepted. This implicitly creates a document-level override (following the override flow in Section 5.4). The snippet owner receives an override notification. The document's staleness indicator clears; the library-level flag remains until the snippet owner resolves it.

### 5.8 Document Duplication

Document duplication is the workflow for creating a new product's document from an existing one. Every block in the source document has a source type (established by the AI Document Generator):

**Spec-referenced blocks** — blocks whose content was generated from spec field values in the source product. On duplication, these blocks are re-resolved against the target product's spec values. If the target product has the referenced fields populated, the block is re-generated with the target product's values. If the target product is missing a referenced field, the block becomes a placeholder flagged with the missing fields.

**Brief-referenced blocks** — blocks whose content was generated from the source product's Product Brief. The target product may not have a Product Brief yet, or its brief may be different. These blocks become placeholders in the duplicated document, with a note identifying the brief fragment that originally sourced them.

**Placeholder blocks** — blocks that were already placeholders in the source document. These carry over as-is in the duplicated document, remaining as placeholders for the new document's author to fill.

**Snippet embeds** — embedded snippets carry over as live references to the same library items. The duplicated document embeds the same snippets as the source. Override state is not copied — the duplicated document starts with all snippet embeds in `live` state regardless of the source document's override state.

On duplication completion, the author sees a summary: how many blocks were resolved, how many became placeholders, and a list of the missing spec fields or brief fragments that produced placeholders.

---

## 6. Design Decisions

**Live transclusion, not copy-on-insert, as the default.**
Copy-on-insert is simpler to build but wrong for compliance-critical content. Hardware documentation teams need a guarantee that regulatory boilerplate is identical everywhere it appears. Live transclusion provides that guarantee structurally, not through process discipline. The added complexity of the override model is the cost of that guarantee — and it is worth paying.

**Override, not unlink.**
A true unlink — severing the source relationship entirely — would allow silent divergence. Override preserves the relationship while allowing deviation. The source is always tracked, changes are always surfaced, and the snippet owner always has visibility. This is the right model for an enterprise documentation product where compliance traceability matters.

**Document owner permission for overrides.**
Override is a powerful action with compliance implications. Restricting it to document owners prevents contributors from inadvertently creating undocumented divergences. It creates a clear accountability chain: the document owner is the person responsible for any deviation from canonical content in their document.

**Block-level promotion only.**
Text-selection-level promotion (highlighting a phrase and promoting it) would require splitting paragraph blocks and creates oddly fragmented content. Block-level promotion is simpler, consistent with Arther's block content model, and sufficient for all real use cases. Authors who want to promote a portion of a paragraph split the paragraph first.

**Snippets support block sequences.**
Single-block snippets would be insufficient for real compliance content, which often consists of a heading and multiple paragraphs that must appear together. Sequences are treated as atomic units — overridden as a unit, versioned as a unit, rolled back as a unit.

**No nested snippets at launch.**
Nested transclusion creates dependency chains that complicate versioning, rollback, and staleness propagation significantly. The constraint is intentional. It may be revisited once the single-level transclusion model is proven in production.

**Snippet deletion blocked on active embeds.**
Silent deletion of a snippet with active embeds would create broken references in documents. Blocking deletion is the safest behaviour. The library shows the embed count, giving the snippet owner the information they need to decide whether to migrate or remove embeds before deleting.

**Spec token resolution is per-document-product.**
Snippets with spec tokens resolve those tokens against the embedding document's linked product at render time. This allows a single snippet to serve multiple products' documents correctly without duplication. The snippet contains the structure and prose; each document contributes the product context.

**Both snippet owner and document owner can resolve stale prose flags.**
Restricting resolution to the snippet owner would create a bottleneck — a document may be ready to publish while waiting for the snippet owner to review. Document-owner resolution is supported as a local override (triggering the standard override notification). This gives document owners autonomy without removing the snippet owner's central role.

**Notification infrastructure is owned by Feature 6 (Collaboration & Review).**
This feature defines which events produce notifications and who receives them, but does not own the delivery layer, read-state tracking, or user preferences. All of that is centralised in Feature 6. This avoids duplicating notification infrastructure across features and ensures a consistent notification UX across the whole product.

**Snippets are variant-aware through document product context, not snippet configuration.**
Spec tokens in snippets resolve against the embedding document's product context — which includes variant field overrides for variant documents. No snippet-level variant configuration is needed. A single snippet correctly serves base product documents and variant documents alike. This is consistent with Section 3.6's per-document-product resolution model and requires no changes to snippet data structures.

---

## 7. Dependencies and Open Questions

### Dependencies

- **Block Editor (Feature 3)** — the block schema, block types, and block handle interaction model must be defined before snippet and template block sequences can be fully specified. The promotion flow depends on the multi-block selection interaction model.
- **AI Document Generator (Feature 2)** — the block source taxonomy (spec-referenced, brief-referenced, placeholder) is established there and is prerequisite to the document duplication workflow in this feature.
- **Smart Spec Tracking (Feature 4)** — the spec token auto-update mechanism and stale prose flag model are established there. This feature extends them to apply inside snippet content.
- **Collaboration & Review (Feature 6)** — the action dashboard is defined in that feature. Snippet override notifications and stale prose review tasks feed into the same dashboard infrastructure.

### Open Questions

**Block library organisation** — how are library items organised for discoverability? Search is necessary; categories or tags may also be needed. The right organisation model depends on how large a library grows in practice. To be resolved when the Publishing Portal and Enterprise features are further defined (workspaces with many products and documents will stress-test library scale).

**Cross-workspace snippets** — the Enterprise feature (Feature 10) will need to decide whether snippets can be shared across workspaces (e.g., a parent organisation sharing compliance boilerplate across subsidiary workspaces). This feature assumes single-workspace scope at launch.

**Snippet and product variants** — resolved. Spec tokens in snippets resolve against the embedding document's product context at render time. For variant documents, this means the variant's field values — including any variant-level overrides of the base product's fields — are used. Snippets are variant-aware through the document's product context, not through snippet-level configuration. No snippet-level variant settings are required; a single snippet correctly serves both base product documents and variant documents with different spec values. This is consistent with the general token resolution model defined in Section 3.6 and with the variant data model in Feature 8.

**Template versioning** — templates are copy-on-insert and have no live relationship to inserted copies. Whether template items in the library maintain a version history (for the library author's own reference) is a minor UX question not resolved here.
