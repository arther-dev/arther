# Arther — Product Requirements Document

**Version:** 1.0
**Date:** May 2026
**Author:** Callum Kelpin
**Status:** Draft

---

## 1. Executive Summary

Arther is an AI-native technical documentation platform built for hardware companies. It solves a specific, persistent problem: hardware companies store product specifications across a fragmented landscape of Excel spreadsheets, PLM systems, PDM tools, Confluence wikis, and ERP systems — and then manually transcribe those specs into datasheets, installation manuals, and owner's manuals that fall out of date the moment a spec changes.

Arther replaces this workflow with a single integrated pipeline: a graph-structured product spec database feeds an AI document generator that produces structured, editable documents which are published through a branded portal. When a spec changes, every document that references it is flagged or auto-updated. The result is documentation that is always current, structurally consistent, and publishable in multiple formats from a single source of truth.

The product targets SMB and mid-market hardware companies — teams of 5 to 50 people involved in product documentation — and is designed to be the system of record for product specifications and the primary authoring environment for all outward-facing technical documents.

This PRD consolidates 18 feature specifications into a single authoritative requirements document. It defines what Arther v1 builds, what it explicitly does not build, the architectural constraints that bind the system together, and the build order implied by feature dependencies.

---

## 2. Problem Statement

Hardware companies produce and maintain a portfolio of technical documents — datasheets, installation manuals, owner's manuals, quick-start guides, compliance declarations — for every product they ship. These documents are the primary interface between the product and its customers, distributors, installers, and regulatory bodies.

The process of creating and maintaining these documents is broken in three specific ways:

**Fragmented spec storage.** Product specifications live in multiple disconnected systems. Electrical specs are in an Excel sheet maintained by engineering. Mechanical dimensions are in the CAD system's PDM. Compliance certifications are tracked in a separate spreadsheet or a PLM system like Arena. Marketing descriptions live in Confluence or Google Docs. No single system holds the complete, current specification for a product. When a document author needs to write a datasheet, they manually gather specs from multiple sources — a process that is slow, error-prone, and repeated for every document.

**Manual document creation.** Once specs are gathered, documents are authored manually in Word, InDesign, or a CMS. The author transcribes spec values into prose and tables, applies brand formatting, and routes the document for review via email or shared drives. This manual transcription is where errors enter: a spec value is mistyped, an outdated value is copied from the wrong source, or a unit conversion is applied incorrectly. For regulated industries, these errors carry compliance risk.

**No change propagation.** When a spec changes — a voltage rating is updated, a dimension is revised, a certification is added — there is no automated mechanism to identify which documents reference the changed spec and update them. Document authors must manually audit their portfolio to find affected documents, then manually update each one. In practice, this audit does not happen consistently, and documents drift out of sync with the product they describe.

The cost of not solving this problem is concrete: incorrect datasheets reaching customers, compliance documents containing outdated certifications, installation manuals referencing superseded specifications, and documentation teams spending the majority of their time on manual transcription and auditing rather than on content quality.

---

## 3. Target Market

### 3.1 Primary Segment

SMB and mid-market hardware companies with 5 to 50 people involved in product documentation. This includes product engineers who own spec data, technical writers who produce documents, compliance leads who review regulatory content, and marketing teams who manage brand presentation.

Industries include consumer electronics, industrial equipment, building products, medical devices, automotive components, and any hardware vertical where products ship with technical documentation.

### 3.2 Why This Segment

Hardware companies in this size range are large enough to have a real documentation burden — multiple products, multiple document types, multiple stakeholders in the review process — but too small to have dedicated documentation infrastructure. They cannot justify the cost and complexity of enterprise CCMS platforms (MadCap Flare, Paligo) or full PLM deployments (Windchill, Teamcenter). They need a purpose-built tool that is powerful enough to handle their documentation complexity but accessible enough that a product engineer or technical writer can use it without training.

### 3.3 User Personas

**Document Author** (technical writer, product engineer, or marketing manager). Creates and edits documents using the AI generator and visual block editor. Manages the spec data for their products. Submits documents for review and publishes them to the portal. This is the primary daily user of Arther and occupies an Editor seat.

**Reviewer / Approver** (compliance lead, regulatory consultant, engineering manager, brand manager). Reviews documents submitted for approval. Leaves comments, requests changes, approves or rejects. May be an internal team member or an external consultant. Does not create or edit documents. Occupies a free Viewer seat if they only review, or an Editor seat if they also author.

**Workspace Administrator** (team lead, documentation manager, or product manager). Configures the workspace: defines Document Types and their approval workflows, manages Brand Profiles, invites team members, assigns roles. Typically also a Document Author.

**Portal Visitor** (customer, distributor, sales engineer, installer). Accesses published documentation through the branded portal. Views documents online or downloads PDFs. May access public documents anonymously or restricted documents via magic link. Not an Arther workspace member.

---

## 4. Product Overview

Arther is built around four core modules that form a sequential pipeline, supported by cross-cutting capabilities that operate across the pipeline.

### 4.1 Core Pipeline

**Module 1 — Product Spec Database.** A graph-structured database where products are composed of independent, reusable components. Each component carries typed spec fields (scalar, range, toleranced, boolean, enum, multi_enum, table, reference). The same component can be shared across multiple products, with product-level scalar overrides where needed. The spec database is the single source of truth for all product data that flows into documents. It supports git-like version control with field-level history, product releases, and provenance tracking for external sync.

**Module 2 — AI Document Generator.** Given a product's spec data and a Product Brief (free-form context and narrative guidance), the generator produces a structured document according to a Document Type schema. The output is a block tree — a structured JSON content model with typed blocks — not rendered code. Each block carries a source taxonomy tag (spec-referenced, brief-referenced, placeholder, manual, snippet, structural) that governs how it behaves when specs change. Generation is atomic: it succeeds completely or not at all. The generator uses Claude (Anthropic) as its sole LLM provider with a zero-hallucination constraint — every factual claim in generated content must trace to a spec field or the Product Brief.

**Module 3 — Visual Block Editor.** A rich editing environment with 20 block types, inline spec tokens (atomic, non-editable references to spec field values), Edit and Preview modes, and a three-panel layout (outline, canvas, properties). The editor operates on the block tree produced by the generator, enabling direct manipulation of structured content. Auto-save with an advisory optimistic lock protects concurrent editing. The editor supports both portal preview and PDF preview modes.

**Module 4 — Publishing Portal.** A branded, SSR-rendered portal where published documents are served to external visitors. The portal uses a frozen artifact model: at publish time, all spec tokens are resolved to concrete values, snippets are flattened, and a self-contained snapshot is created. The published snapshot is immutable — subsequent spec changes do not affect it until the document owner creates a new revision and republishes. The portal supports public access, magic-link gated access, custom domains, and PDF download via headless Chrome rendering at publish time.

### 4.2 Cross-Cutting Capabilities

**Smart Spec Tracking.** A two-speed change propagation system. When a spec field changes, structured content (spec tables, inline tokens) auto-updates in the working copy. Prose content that references the changed spec is flagged for human review rather than auto-rewritten. An action dashboard surfaces all pending updates, organized by domain owner, with a review modal for accepting or modifying proposed changes.

**Collaboration & Review.** A four-state document lifecycle (Draft → Review → Approved → Published) with AND-logic approval roles, block-level and text-range comment anchoring, revision-scoped comments, and a unified notification system. Approval roles are defined per Document Type, and all required roles must approve before a document can advance.

**Content Reuse.** A block library containing snippets (live transclusion — content stays in sync with the source) and templates (copy-on-insert — content is independent after insertion). Snippets support versioning, rollback, and an override model where individual instances can diverge from the source while tracking that divergence.

**Product Variants.** A delta-from-base model where variants inherit all base product specs and override only what differs. Four delta types (scalar override, component swap, component remove, component add) define the variant's divergence. Documents are variant-aware: a single document can contain blocks scoped to all variants, derived-from-spec blocks that resolve per variant, or manually differentiated blocks. Generation uses a generate-per-variant-then-merge strategy with a two-path conflict resolution model.

---

## 5. Strategic Goals

1. **Become the system of record for product specifications** at hardware companies that currently fragment specs across Excel, PLM, PDM, and wikis. Arther should be the one place a team member goes to find the current, authoritative spec for any product.

2. **Reduce time-to-publish for technical documents by 80% or more** compared to manual authoring workflows. A document that takes a team two weeks to produce manually — gathering specs, writing content, formatting, routing for review — should take hours in Arther.

3. **Eliminate spec-to-document drift.** When a spec changes, every document that references it should be flagged or updated within minutes, not discovered weeks later during a manual audit.

4. **Support the full document lifecycle in a single tool** — from spec entry through AI generation, editing, review, approval, and publication — so that no part of the workflow requires leaving Arther or maintaining a parallel system.

5. **Meet the quality bar that regulated industries require.** Hardware companies in medical devices, building products, and industrial equipment need documentation that is accurate, auditable, and compliant. Arther's zero-hallucination constraint, attribution model, approval workflow, and version history are designed to satisfy these requirements.

6. **Deliver a UX that matches Figma Make's ease of use** — prompt, generate, see, publish — while avoiding its fundamental limitation of producing rendered code instead of editable structured content.

---

## 6. Non-Goals (Explicitly Out of Scope for v1)

**Real-time collaborative editing.** Google Docs-style simultaneous cursors and operational transforms are not built. Arther uses an advisory optimistic lock model — one user edits at a time, with clear messaging if another user is active. This is appropriate for the document production workflow where authors work sequentially, not simultaneously.

**Enterprise identity (SSO, SCIM, advanced RBAC).** The enterprise readiness spec establishes architectural guardrails (canDo abstraction, attribution fields, decoupled auth) so that SSO, SCIM, and granular RBAC can be added post-launch without structural rewrites. But they are not built for v1.

**External system sync (PLM, ERP, PDM integration).** The External Sync spec defines the SpecReconciler architecture, intake modes, and mutation taxonomy. Arena PLM is identified as the first integration target. But all sync infrastructure is deferred to post-launch. File-based import (CSV/Excel) is supported at launch; live webhook sync is not.

**Billing infrastructure.** The billing model is defined (seat-based, Editor paid / Viewer free, AI generation included) but the billing admin UI, payment processing, and subscription management are post-launch. Arther will be dogfooded internally before external billing is needed.

**Offline-first architecture.** Arther is a connected product. A local save queue protects in-progress edits during connectivity loss, but AI generation, review workflows, and publishing require a live connection. No service workers or offline-first infrastructure is built for the portal.

**AI generation metering.** No token counters, quotas, or rate limits are enforced at v1. The analytics event model provides observability into generation volume. Metering can be added post-launch if unit economics require it.

**Scroll depth and section engagement analytics.** Portal analytics track page views, downloads, and search queries. Section-level engagement (scroll depth, time on section) is deferred — it requires non-trivial instrumentation for marginal insight at launch.

**Nested snippets.** Snippets cannot contain other snippets. This avoids resolution-order complexity and recursive update chains. If needed post-launch, it can be scoped as a distinct capability.

**DOCX export.** Removed from v1 scope. PDF (via headless Chrome) and web (via portal) are the two output formats. DOCX can be added post-launch if customer demand justifies the implementation cost.

**Custom portal themes beyond Brand Profile controls.** Brand Profiles control logo, colour palette, typography, and tone. Full custom CSS or theme overrides for the portal are not supported at v1.

---

## 7. Feature Requirements

### 7.1 Product Spec Database (Feature 1)

**Spec version:** v1.5

#### 7.1.1 Data Model

The spec database uses a graph model, not a tree. Products and components are independent entities connected by a many-to-many join.

**Must-Have (P0):**

- **Product entity.** Name, description, status, metadata fields, product-level spec fields, created/updated timestamps, created_by attribution.
- **Component entity.** Independent, reusable across products. Name, description, default_category (for domain ownership fallback), component-level spec fields, created/updated timestamps.
- **ProductComponent join record.** Links a product to a component with display_order, optional scalar_overrides (product-level overrides of component field values), and quantity.
- **SpecField entity.** Belongs to either a product or a component. Eight field types: scalar, range (min/max/unit), toleranced (nominal/plus/minus/unit), boolean, enum (single-select from defined options), multi_enum (multi-select), table (rows × columns with typed cells), and reference (link to another product or component).
- **Unit Registry.** Workspace-scoped registry of measurement units with display formatting rules. Referenced by field types that carry units.
- **FieldVersion entity.** Immutable version record created on every field value change. Records field_id, version_number, value snapshot, changed_by, changed_at, and optional change_reason. Enables full field-level history and point-in-time reconstruction.
- **ProductRelease entity.** Named, immutable snapshot of a product's complete spec state at a point in time. References the specific FieldVersion for every field. Used for audit trail and as a baseline for variant comparison.
- **BlockSpecReference entity.** Records which document blocks reference which spec fields, with variant_id for variant-aware staleness tracking. This is the join that powers Smart Spec Tracking.
- **FieldComment entity.** Comments on individual spec fields with version context markers, enabling discussion about field values with awareness of which version the comment was made against.
- **Provenance fields on SpecField.** source_system, source_field_path, sync_baseline_value, last_synced_at — pre-wired for External Sync post-launch.

**Acceptance criteria:**
- A component can be attached to multiple products without duplication
- Changing a component's field value propagates staleness flags to all products that include that component
- Product-level scalar overrides on a ProductComponent do not modify the underlying component
- Field history is immutable and auditable — no version can be deleted or modified after creation
- Archiving a product or component follows the archive-only lifecycle rules (see §7.13)

#### 7.1.2 Frontend

- **Three-panel layout:** product/component list (left), field grid (centre), field detail/history (right).
- **Figma component/instance mental model:** components are like Figma components; products that include them are like instances with optional overrides.
- **Three entry points:** global product list, component library, and in-document navigation from a spec token back to the source field.
- **Inline editing** of field values directly in the grid view, with validation per field type.

#### 7.1.3 Import

- **AI-powered Excel/CSV import** using Claude to map columns to spec fields, propose field types, and resolve ambiguities with user confirmation.
- **SpecReconciler** shared service that normalises incoming data (from file import at v1, from webhooks post-launch) into Arther's field model.
- **Import templates** for common hardware documentation patterns (electrical specs, mechanical dimensions, compliance certifications).

---

### 7.2 AI Document Generator (Feature 2)

**Spec version:** v1.2

#### 7.2.1 Two Input Layers

**Must-Have (P0):**

- **Spec Fields** — structured data from the Spec Database. Every factual claim in generated content must trace to a spec field value. The generator does not invent, interpolate, or infer spec values.
- **Product Brief** — free-form narrative context provided by the document author. Mirrors the graph model with named fragment keys (e.g., `overview`, `installation_context`, `target_audience`). The brief provides context, tone guidance, and narrative framing that spec fields alone cannot supply. Brief fragments are referenced in Document Type schemas so the generator knows which brief content feeds which section.

#### 7.2.2 Document Types

- **Document Type as generation schema.** Each Document Type defines the sections a document contains, what spec fields and brief fragments feed into each section, and the structural expectations (block types, ordering, length guidance).
- **Section data contracts.** Each section in a Document Type schema declares its inputs (which spec fields, which brief fragments) and its expected output structure (which block types are appropriate).
- **Document Type versioning.** When a Document Type schema is updated, existing documents generated from the previous version are not retroactively affected. They continue through their lifecycle with the schema that was active at generation time.

#### 7.2.3 Generation Behaviour

- **Atomic generation.** Either all blocks are produced and the document is created in Draft state, or nothing is saved and the user retries. No partial documents.
- **Block source taxonomy.** Every generated block carries a source tag: spec-referenced (content derived from spec field values), brief-referenced (content derived from Product Brief), placeholder (spec field was null at generation time), structural (section headers, dividers, ToC — not content-bearing), or snippet (inserted from the block library). Manual source is assigned when a user edits a generated block.
- **Inline spec reference tags.** Spec values embedded in prose are rendered as structured InlineSpecTokenNodes — atomic, non-editable tokens that display the current field value and link back to the source field. These tokens are the mechanism by which Smart Spec Tracking detects and propagates changes.
- **Pre-flight completeness summary.** Before generation, the system shows which spec fields are populated and which are null, so the author knows what will generate as real content and what will produce placeholders.
- **Placeholder block behaviour.** Blocks generated from null spec fields are clearly marked as placeholders with a visual indicator and a prompt to fill in the missing spec. When the spec field is later populated, Arther offers to auto-generate content for the placeholder.

#### 7.2.4 Brand & Quality

- **Brand Profiles.** Define the visual and tonal identity applied to generated content: logo, colour palette, typography preferences, tone of voice, terminology preferences. Managed in Workspace Settings; assigned as a default per Document Type with per-document override.
- **Document Quality Standards.** Separate from Brand Profiles. Define structural and readability rules per Document Type: section length limits, reading level targets, required sections. Enforced as advisory warnings in the pre-flight check at review submission, not as hard blocks.

#### 7.2.5 LLM Provider

- **Claude (Anthropic) as sole LLM provider.** No abstraction layer, no provider-switching architecture. The integration is optimised for Claude's capabilities. If a provider change is ever needed, it is treated as a migration, not a configuration change.
- **Zero-hallucination constraint.** Every factual claim must trace to a spec field or the Product Brief. The generator does not fabricate specifications, invent performance claims, or extrapolate from provided data.

---

### 7.3 Visual Block Editor (Feature 3)

**Spec version:** v1.2

#### 7.3.1 Block Types

20 block types organised into a BlockType union:

- **Structural:** section_header, divider, page_break, toc
- **Text:** heading, paragraph, code_block, callout
- **Data:** spec_table, chart
- **Advisory:** warning, caution, note
- **Media:** image, video, gif, hotspot_image
- **Interactive:** accordion, step_wizard
- **Reuse:** snippet (transclusion from block library)

Each block type has a static contract defining its properties, accepted content, and degradation behaviour for PDF rendering.

#### 7.3.2 Rich Text Model

- **RichTextContent** composed of three node types: TextNode (formatted text with bold, italic, underline, strikethrough, code, superscript, subscript), InlineSpecTokenNode (atomic spec value reference), and LinkNode (hyperlink).
- **Inline spec tokens are non-editable.** They display the current spec field value and are the mechanism for change tracking. They cannot be partially selected, split, or manually modified — only deleted and re-inserted.

#### 7.3.3 Editor Layout & Modes

- **Three-panel layout:** document outline (left), canvas (centre), block properties (right).
- **Edit mode:** full editing capabilities, block manipulation, property editing.
- **Preview mode** with two sub-modes: Portal preview (renders as the portal visitor would see it) and PDF preview (renders as the PDF export would appear).
- **Container model:** one level of nesting only. Blocks can be grouped into a single container level but containers cannot nest inside other containers.

#### 7.3.4 Editing Capabilities

- **Auto-save** with advisory optimistic lock. Changes are saved automatically at regular intervals. If another user has the document open for editing, a banner indicates who is editing — the system does not block, but advises.
- **Cross-block operations:** multi-select, drag-and-drop reordering, bulk delete, copy/paste across documents.
- **Find and replace** across the document, excluding spec tokens (tokens are read-only references to spec data, not editable text).
- **Search** with four scopes: full-text across all workspace documents, spec field value search, block library search, and within-document search.

#### 7.3.5 Export

- **PDF via headless Chrome.** The editor's preview mode renders the document as it will appear in PDF; headless Chrome captures this rendering at publish time.
- **DegradationConfig per block type.** Each block type defines how it degrades in PDF (e.g., video → thumbnail with caption, accordion → expanded flat list, hotspot_image → annotated static image).
- **DOCX export removed from v1 scope.**

---

### 7.4 Smart Spec Tracking (Feature 4)

**Spec version:** v1.3

#### 7.4.1 Two-Speed Update Model

- **Structured content auto-updates.** When a spec field changes, blocks that contain structured references to that field (spec tables, inline spec tokens) are updated automatically in the document's working copy. No human intervention required.
- **Prose content is flagged for review.** When a spec field changes, blocks that contain prose referencing that field are flagged as stale but not auto-rewritten. The AI can propose updated prose, but a human must review and accept the change. This reflects the reality that prose content carries editorial judgment that should not be silently overwritten.
- **Brief-referenced block staleness.** When a Product Brief fragment is edited, blocks sourced from that fragment receive a light staleness indicator — distinct from the urgent spec-change staleness. This signals that the narrative context has evolved without implying data accuracy issues.
- **Pre-commit impact summary.** When a spec owner is about to save a field value change, a pre-commit summary shows how many documents and blocks will be affected by the change, giving the user visibility into the downstream impact before committing.

#### 7.4.2 Working Copy vs. Published Snapshot

- Changes propagate to the **working copy** of a document, never to the published snapshot. The published portal content remains frozen until the document owner explicitly creates a new revision and republishes. This ensures that published documentation is stable and predictable.

#### 7.4.3 Domain Ownership

- **Workspace-level ownership matrix** mapping spec field categories to workspace members. Determines who is notified and responsible for reviewing spec-driven changes.
- **Per-product panel** for overriding the workspace-level defaults on specific products.
- **Component-level default_category** on the Component entity, providing a fallback category assignment for all fields on that component.
- **Four-step fallback chain** for determining the domain owner of a specific field change: (1) explicit per-product override, (2) component default_category, (3) workspace-level category mapping, (4) document owner as final fallback.

#### 7.4.4 Action Dashboard

- **Centralised dashboard** surfacing all pending spec-driven updates across the workspace, grouped by domain owner.
- **DashboardActionItem types:** SectionReviewItem (prose blocks needing human review), ScalarOverrideReviewItem (product-level overrides affected by component field changes), SnippetReviewItem (snippets containing spec references), ChartConfigurationFlag (charts whose data source fields have changed).
- **Review modal** with a git merge conflict-style interface for accepting, modifying, or dismissing proposed changes.

#### 7.4.5 Variant-Aware Staleness

- **variant_id on BlockSpecReference** enables the system to track staleness per variant. A base spec change may make a variant-scoped block stale without affecting the base document's version of that block, and vice versa.

#### 7.4.6 Spec Coverage Report

- A report surface showing, per document, which spec fields are referenced and which are available but unused. Helps document authors identify gaps in their coverage.

---

### 7.5 Publishing Portal & Export (Feature 5)

**Spec version:** v1.2

#### 7.5.1 Frozen Artifact Model

- At publish time, the system resolves all dynamic content: spec tokens are replaced with concrete values, snippets are flattened to static content, and a self-contained snapshot is created.
- The published snapshot is immutable. Presentation (Brand Profile styling) can be updated without republishing, but content cannot change until a new revision is published.
- Previous published snapshots are retained in portal history for versioning and rollback.

#### 7.5.2 Publish-Time Processing

- **Snapshot creation** with full content resolution.
- **Headless Chrome PDF generation** — blocking operation at publish time. The PDF is generated from the resolved snapshot and stored as a downloadable artifact.
- **Pre-flight checks** before publishing: blocking checks (vacant approval roles) and advisory warnings (placeholder blocks, orphaned tokens, stale blocks, unresolved comments, quality standard violations).

#### 7.5.3 Portal Structure

- **Homepage:** product grid displaying all products with published documents, organised by the workspace's product catalogue.
- **Product landing page:** lists all published documents for a specific product, with variant picker if variants exist.
- **Document page:** the rendered published document with navigation, variant switching, and PDF download.
- **Semantic versioning** for published document revisions.

#### 7.5.4 Access Control

Three access tiers per document:
- **Public:** accessible without authentication.
- **Open magic link:** accessible to anyone with a valid magic link (link can be forwarded).
- **Allowlisted magic link:** accessible only to specific email addresses issued a magic link.

Magic links are issued by workspace members, optionally with expiry dates. Revocation is immediate.

#### 7.5.5 Portal Branding

- Brand Profile controls applied to portal rendering: logo, colour palette, typography.
- **Custom domains** supported — workspace can map a custom domain to their portal.
- Portal is SSR-rendered with JS hydration for interactive elements (search, variant picker, navigation).

---

### 7.6 Collaboration & Review (Feature 6)

**Spec version:** v1.1

#### 7.6.1 Document State Machine

Four states with defined transitions:
- **Draft** → Review (submission by document owner)
- **Review** → Draft (pull-back by owner, or rejection by approver)
- **Review** → Approved (all required approval roles satisfied)
- **Approved** → Published (publish action by document owner)
- **Published** → Draft (create new revision)

#### 7.6.2 Working Copy Model

- Published documents have an immutable published snapshot and a mutable working copy.
- Creating a new revision creates a working copy from the published snapshot. Edits happen on the working copy. Publishing replaces the snapshot atomically.
- Document revisions are explicit creations, not automatic.

#### 7.6.3 Approval Workflow

- **Three document-level roles:** Document Owner (the author), Reviewer (can comment), Approver (can approve or reject, and can make minor text corrections to documents in Review without triggering a rejection cycle).
- **AND logic at the role level.** All required approval roles defined on the Document Type must be satisfied before a document can advance to Approved. Within a role, any assigned member can approve on behalf of that role.
- **Approval reset on rejection.** When a document is rejected and returned to Draft, all previously collected approvals are fully reset. The owner must re-submit and collect all approvals again.
- **Owner override.** The document owner can override outstanding approvals and force-advance to Approved. This action is logged in the audit trail.
- **Per-Document-Type approval role configuration.** Each Document Type defines its own set of named approval roles and member assignments. Approval roles are not global.

#### 7.6.4 Comment Model

- **Block-level anchoring.** Comments are anchored to a specific block in a specific revision.
- **Text-range anchoring.** Within a text block, comments can be anchored to a specific text range (highlighted text).
- **Revision-scoped comments.** Comments are associated with the revision they were created on. When a new revision is created, unresolved comments from the previous revision are carried forward with a visual indicator marking them as inherited.
- **Comment orphaning.** If the block a comment is anchored to is deleted or substantially restructured, the comment becomes orphaned — it is preserved but its anchor is marked as invalid. Orphaned comments appear in a dedicated section of the comment panel.
- **@mention system.** Users can @mention workspace members in document comments, spec field comments, and review messages. Mentions trigger notifications through the unified notification system and serve as the primary mechanism for pulling specific people into a discussion.

#### 7.6.5 Unified Notification System

Feature 6 owns the notification delivery infrastructure for the entire product. Notification events from other features (Smart Spec Tracking staleness alerts, Content Reuse snippet updates, Collaboration review requests) are all delivered through this system.

Notification channels: in-app notification panel and email. Per-user notification preferences control which events trigger email notifications.

---

### 7.7 Content Reuse (Feature 7)

**Spec version:** v1.1

#### 7.7.1 Block Library

- A workspace-level library of reusable content blocks, accessible from the editor.
- Two reuse modes: **snippets** (live transclusion) and **templates** (copy-on-insert).

#### 7.7.2 Snippets (Live Transclusion)

- A snippet embedded in a document maintains a live link to the source. When the source snippet is updated, all embedded instances reflect the change.
- **Override model:** An embedded snippet instance can be overridden locally. The instance tracks its state: `live` (in sync with source), `overridden` (locally modified, diverged from source), or `source_changed` (source updated since the override was applied — user must decide whether to accept the source update or keep the override).
- **Snippet versioning.** Each edit to a snippet source creates a new version. Document owners can roll back an embedded instance to a previous snippet version.
- **Deletion protection.** Snippets with active embedded instances cannot be deleted, only archived. Archiving converts all live instances to static copies.
- **No nested snippets.** A snippet cannot contain another snippet.

#### 7.7.3 Templates (Copy-on-Insert)

- A template inserted into a document creates an independent copy. No live link is maintained. The inserted content is fully editable and diverges freely from the source.

#### 7.7.4 Variant Awareness

- Snippets are variant-aware through the document's product context. A snippet embedded in a variant-scoped document section resolves spec tokens using the variant's resolved spec, not the base product's spec.

#### 7.7.5 Document Duplication

- A document can be duplicated as a starting point for a new document. Duplication creates a new Draft document with all content copied. Snippet instances in the duplicate maintain their live links to the source snippets. Spec tokens are re-linked to the new document's product context.

---

### 7.8 Product Variants (Feature 8)

**Spec version:** v1.2

#### 7.8.1 Delta-from-Base Model

- A variant inherits all spec data from its base product and overrides only what differs.
- **Four delta types:**
  - SCALAR_OVERRIDE — override a single field value on the base product or a component
  - COMPONENT_SWAP — replace a base component with a different component
  - COMPONENT_REMOVE — remove a component that exists on the base product
  - COMPONENT_ADD — add a component that does not exist on the base product
- **Resolved spec** computed at query time by applying deltas to the base product's current spec. Cached with invalidation when the base or delta changes.

#### 7.8.2 Variant-Aware Documents

- **BlockVariantScope** with three modes:
  - ALL — block content is identical across all variants
  - DERIVED — block content is auto-generated from spec data and resolves differently per variant based on the resolved spec
  - MANUAL — block content is manually differentiated per variant by the author
- **Generate-per-variant-then-merge strategy.** The AI generator runs once per variant, then merges the outputs into a single document. Blocks with identical content across variants are tagged ALL. Blocks that differ are tagged DERIVED or presented for manual differentiation.

#### 7.8.3 Merge Conflict Resolution

Two-path model:
- **AI-generated conflicts (non-blocking).** When the generator produces different content for different variants, these are surfaced in a staleness dashboard for review but do not block the document workflow.
- **Human-edited conflicts (blocking).** When a human has edited variant-specific content and a regeneration produces a different version, a side-by-side comparison panel requires the author to resolve the conflict before proceeding.

#### 7.8.4 Portal Variant Experience

- Base product URL with a variant picker. Each variant also has a canonical URL for direct linking.
- **Comparison view** (internal only, not portal-facing) — a block-level, read-only side-by-side comparison of how a document renders across variants.

---

### 7.9 Workspace Administration (Feature 10)

**Spec version:** v1.0

#### 7.9.1 Workspace Role Model

Four roles with increasing privilege:

| Role | Seat Tier | Key Permissions |
|---|---|---|
| **Owner** | Editor (paid) | All Admin permissions + workspace deletion + ownership transfer. Exactly one per workspace. |
| **Admin** | Editor (paid) | Manage settings, members, Document Types, Brand Profiles. Multiple per workspace. |
| **Member** | Editor (paid) | Create products/components, generate/edit documents, edit spec fields. Cannot access settings. |
| **Viewer** | Free | View documents, comment, approve/reject in review. Cannot create or edit. |

Workspace roles and document-level approval roles are independent. An Admin is not automatically an Approver; a Member can be an Approver on specific Document Types.

#### 7.9.2 Workspace Settings

- Workspace name, logo, and URL slug (immutable after first set — slug changes would break all portal URLs).
- Members management: invite via email, role assignment, role changes (immediate effect), removal (blocked until document ownership transferred).
- Ownership transfer: Owner → Admin with password confirmation; irreversible without new Owner's consent.

#### 7.9.3 Document Type Configuration

- Name, description, schema (structural definition), approval roles, and default Brand Profile.
- Approval role configuration: named roles (required or optional), member assignment (any member of a role can approve on behalf of that role).
- Archiving: Document Types with generated documents cannot be deleted, only archived.

#### 7.9.4 Brand Profile Management

- Create, edit, duplicate, archive Brand Profiles.
- Workspace default Brand Profile: applied to Document Types without an explicit assignment. Cannot have zero Brand Profiles.
- Cannot delete a Brand Profile referenced by any Document Type as its default.

#### 7.9.5 Post-Launch Placeholders

- **Integrations** section: visible in navigation with "Coming soon" state. Will house External Sync configuration when it ships.
- **Billing** section: visible in navigation with "Coming soon" state. Will house subscription management when billing infrastructure is built.

---

### 7.10 Onboarding & First-Run Experience (Feature 11)

**Spec version:** v1.0

#### 7.10.1 Philosophy

No mandatory tutorials, no training modules, no forced walkthroughs. Users access the product immediately. Learning happens contextually through an AI assistant.

#### 7.10.2 AI Assistant

- Persistent Help button on every screen. Opens a chat panel (slides in from right, does not obscure the view).
- Answers questions about how to use Arther in plain language.
- **Spotlight mechanism:** when the answer involves a specific UI element, the assistant highlights that element with a non-blocking overlay (dims surroundings, animated ring, one-line label, auto-dismisses after 5 seconds or on click).
- Scope boundaries: explains and directs only. Does not generate content, edit data, or take actions on behalf of the user.

#### 7.10.3 Admin First-Run

- **Setup checklist** displayed on workspace home when minimum configuration is incomplete. Not a wizard — no enforced order, no gating.
- Checklist items: Create first Brand Profile, Create first Document Type, Invite team (dismissible), Add first product.
- Collapses (not disappears) when complete. Admin can dismiss the collapsed banner.

#### 7.10.4 Member First-Run

- Clean home screen with empty document list and a single contextual prompt: "Generate your first document to get started" with a New Document button.
- No welcome modal, no tutorial. AI assistant available via Help button.
- No role-based onboarding differences — Approvers discover the approval workflow naturally when they receive their first review request.

#### 7.10.5 Empty State Patterns

Consistent across all screens: one-sentence description of what the area does, primary action button (where applicable), and a one-time contextual AI assistant nudge on first visit only. Functional — no decorative illustrations.

---

### 7.11 Analytics (Feature 12)

**Spec version:** v1.0

#### 7.11.1 Two Analytics Domains

**Portal consumption analytics** — how external visitors interact with published documents:
- `document_viewed` — fired per page load, with session_id and optional magic_link_id
- `document_downloaded` — fired on PDF download initiation
- `portal_searched` — fired on search submission, capturing query and results_count (zero-result searches are a key signal)

**Workspace analytics** — how the internal team uses Arther:
- `document_generated` — success/failure, duration, blocks generated, document type
- `document_state_changed` — all lifecycle transitions with trigger type and optional rejection reason
- `block_regenerated` — manual or spec-change triggered, with source field reference
- `spec_field_updated` — field changes with source (manual or sync)

#### 7.11.2 Visitor Identity Model

- Public documents: anonymous, session-based only.
- Restricted documents (magic link): identified by magic link recipient (email/name). Enables named consumption analytics.

#### 7.11.3 Analytics Surfaces

- **Per-document consumption panel** in the editor sidebar (view count, unique visitors, downloads, identified viewers for restricted docs).
- **Consumption analytics** in the admin panel (cross-document comparison, top queries, zero-result searches). Owners and Admins only.
- **Workspace analytics** in the admin panel (generation success rates, review cycle times, rejection rates, staleness counts). Owners and Admins only.

---

### 7.12 Billing & Pricing (Feature 13)

**Spec version:** v1.0

#### 7.12.1 Seat Model

- **Editor seats (paid):** Owners, Admins, Members. Can create, edit, and manage.
- **Viewer seats (free):** Can view, comment, and approve. Designed for reviewers and external approvers who never author content.
- Seat tier is derived from workspace role. Role changes that cross the Editor/Viewer boundary are timestamped for future proration.

#### 7.12.2 Included in Seat Price (No Metering at v1)

- AI document generation and block regeneration — no per-generation charge, no token quota.
- Document storage (block content, snapshots, uploaded assets).
- Portal bandwidth.

#### 7.12.3 Architecture Requirements

- System must distinguish Editor from Viewer seats and enforce the permission boundary.
- Seat count tracking required for post-launch billing UI.
- Role-to-seat mapping with timestamps for proration.
- No generation metering, no storage/bandwidth quotas at v1.

#### 7.12.4 Deferred Billing Questions

Free workspace tier, pricing tiers (Starter/Pro/Enterprise), enterprise pricing (SSO/SCIM bundling), annual vs. monthly billing, and AI generation overage models are all explicitly deferred to post-launch.

---

### 7.13 Error Handling & Entity Lifecycle (Feature 14)

**Spec version:** v1.0

#### 7.13.1 Core Principles

- **Archive-only for entities with dependents.** Products, Components, Spec Fields, Document Types, Brand Profiles, and Snippets cannot be hard-deleted while other entities reference them.
- **Allow the action, surface the consequence.** Lifecycle actions proceed where possible; the system handles cascades explicitly via notifications and state changes.
- **Documents in Review are protected.** Any change that compromises a document under review automatically returns it to Draft.
- **Attribution is permanent.** Archived entities and removed members retain attribution in audit trails, comments, and approval records.

#### 7.13.2 Key Cascade Rules

- **Component archived → dependent documents:** Draft documents flagged with orphaned tokens; Review/Approved documents returned to Draft; Published snapshots unaffected (flag set for next revision).
- **Snippet archived:** embedded instances become static copies (lose live link); documents flagged but not returned to Draft (snippet archival is less structurally critical).
- **Workspace member removed:** blocked until all document ownership transferred. Past comments and approvals preserved with "former member" attribution. Vacant approval roles flagged.
- **Product Brief deleted:** existing documents unaffected (no live dependency post-generation). Future regeneration using that brief is no longer possible.

#### 7.13.3 Pre-Flight Checks at Review Submission

Advisory warnings: placeholder blocks, orphaned spec tokens, stale blocks, unresolved comments, quality standard violations. Blocking: vacant approval role (the only blocking check).

---

### 7.14 Connectivity Model (Feature 15)

**Spec version:** v1.0

- **Always-visible connectivity indicator** (Connected/Saving/Offline).
- **Local save queue** protects in-progress edits. Editor remains fully editable offline. Queue drains automatically on reconnect.
- **Block-level conflict resolution** on reconnect if another user edited the same block during the offline period.
- **Operations blocked offline:** AI generation, block regeneration, send for review, approve/reject, publish, invite members, workspace settings changes. Each displays a clear inline message.
- **Portal:** standard browser caching; PDF download as the genuine offline solution. No service worker infrastructure at v1.

---

### 7.15 External Sync (Feature 9 — Deferred Post-Launch)

**Spec version:** v1.1

This feature is fully specified but deferred from v1 build. The specification exists to constrain the architecture of features that ship at launch so that External Sync can be added without structural rewrites.

Key architectural elements pre-wired at v1:
- **SpecReconciler** service shared between file import (v1) and webhook sync (post-launch).
- **Provenance fields** on SpecField (source_system, source_field_path, sync_baseline_value, last_synced_at).
- **source field** on the spec_field_updated analytics event to distinguish manual edits from sync.

When built, External Sync will support three intake modes (webhook push, scheduled pull, manual trigger), two payload types (full snapshot, incremental delta), a three-tier mutation taxonomy (Tier 1 auto-apply, Tier 2 notify, Tier 3 hold for review), and dry-run mode with selective commit. Arena PLM is the first planned integration target.

---

### 7.16 Enterprise Readiness (Guardrails Only)

Not a build spec — three architectural constraints that apply across all features:

1. **canDo abstraction.** All permission checks route through a single canDo(user, action, resource) function. This creates the extension point for granular RBAC post-launch without scattering permission logic across the codebase.
2. **Attribution fields.** Every mutation carries created_by, updated_by, and timestamp fields. This enables audit trails that enterprise customers require.
3. **Decoupled auth.** Authentication is a pluggable module, not hard-wired into the application layer. This allows SSO (SAML, OIDC) to be added post-launch without modifying business logic.

---

## 8. Architectural Invariants

These are system-wide rules that apply across all features and cannot be violated by any individual feature's implementation.

1. **Single source of truth for specs.** The Spec Database is the authoritative source for all product specification data. No other part of the system stores or caches spec values independently (except the frozen published snapshot, which is an intentional point-in-time copy).

2. **Block-first document model with six source types.** Every block in every document carries a source tag (spec-referenced, brief-referenced, placeholder, manual, snippet, structural). This tag governs how the block behaves when specs change and is the foundation of Smart Spec Tracking.

3. **Graph model, not tree.** Products and components are independent entities connected by a many-to-many join. Components are not owned by products — they are shared across products and carry their own identity and field history.

4. **Two-speed update.** Structured content auto-updates; prose content is flagged for human review. This distinction is fundamental and cannot be collapsed into "auto-update everything" or "flag everything."

5. **Working copy vs. frozen snapshot.** Changes propagate to working copies, never to published snapshots. The published portal content is stable until explicitly republished.

6. **Zero-hallucination.** Every factual claim in AI-generated content must trace to a spec field or the Product Brief. The generator does not fabricate, interpolate, or infer.

7. **Archive-only for entities with dependents.** Hard delete is only available when all dependencies are resolved. Archiving preserves reference integrity.

8. **Unified notification system owned by Feature 6 (Collaboration).** All notification events from all features are delivered through a single system. No feature builds its own notification delivery.

9. **Single LLM provider (Claude/Anthropic).** No abstraction layer, no provider switching. The integration is optimised for one provider.

---

## 9. Feature Dependency Map & Build Order

The features have structural dependencies that constrain build order:

**Foundation layer (must build first):**
- Workspace Admin (Feature 10) — roles, members, permissions are prerequisites for everything
- Spec Database (Feature 1) — all content derives from spec data
- Billing seat enforcement — Editor/Viewer distinction must be enforced from first login

**Core pipeline (build sequentially):**
- AI Document Generator (Feature 2) — depends on Spec Database and Document Types
- Visual Block Editor (Feature 3) — depends on Generator's block tree output model
- Smart Spec Tracking (Feature 4) — depends on Spec Database field versioning + Editor's block model
- Publishing Portal (Feature 5) — depends on Editor, Brand Profiles, and the frozen snapshot model
- Collaboration & Review (Feature 6) — depends on Editor and Portal; owns notification delivery

**Capabilities that layer on top:**
- Content Reuse (Feature 7) — depends on Editor's block model; plugs into the block library
- Product Variants (Feature 8) — depends on Spec Database graph model + Generator's merge strategy
- Analytics (Feature 12) — depends on Portal (consumption events) and all workspace events
- Onboarding (Feature 11) — depends on all features existing to provide assistant knowledge base

**Cross-cutting (built alongside everything):**
- Error Handling & Entity Lifecycle (Feature 14) — informs implementation of every feature
- Connectivity Model (Feature 15) — informs editor implementation
- Enterprise Readiness guardrails — inform every feature's permission and attribution implementation

**Post-launch:**
- External Sync (Feature 9) — architecture pre-wired at v1; implementation deferred
- Billing UI — model defined at v1; admin UI deferred

---

## 10. Items Explicitly Deferred from v1

| Item | Rationale | Pre-Wired at v1? |
|---|---|---|
| External Sync (PLM/ERP webhooks) | Implementation complexity; file import covers launch needs | Yes — SpecReconciler, provenance fields, analytics source field |
| SSO / SAML / OIDC | Enterprise feature; requires auth infrastructure | Yes — decoupled auth module |
| SCIM provisioning | Enterprise feature; depends on SSO | No |
| Advanced RBAC (per-department admin scoping) | Premature; four-role model (Owner/Admin/Member/Viewer) covers launch needs | Yes — canDo abstraction |
| Billing admin UI | No external customers during dogfood phase | Yes — seat count tracking, role-to-seat timestamps |
| Free/trial workspace tier | Go-to-market decision post-dogfood | No |
| DOCX export | Insufficient demand signal; PDF + web cover launch needs | No |
| Real-time collaborative editing | Disproportionate complexity for document production workflow | No |
| Nested snippets | Resolution-order complexity; single-level covers launch needs | No |
| Scroll depth / section engagement analytics | Non-trivial instrumentation for marginal insight | No |
| AI generation metering | Anticipated volume doesn't justify metering infrastructure | Yes — document_generated analytics event |
| Offline-first portal (service workers) | PDF download covers the genuine offline use case | No |
| Custom portal CSS/themes | Brand Profile controls cover launch needs | No |

---

## 11. Success Metrics

### 11.1 Leading Indicators (Days to Weeks Post-Launch)

| Metric | Target | Measurement |
|---|---|---|
| Time from product creation to first published document | < 4 hours for a complete datasheet | Track elapsed time from first product creation to first publish event per workspace |
| AI generation success rate | > 95% | document_generated events where success = true ÷ total |
| Spec-to-document update latency | < 5 minutes from spec change to dashboard action item | Time between spec_field_updated and corresponding dashboard item creation |
| Review cycle time | < 48 hours from submission to approval | document_state_changed events: time from Draft→Review to Review→Approved |
| Document generation adoption | 100% of published documents generated via AI (vs. blank-start) | Count of documents with at least one spec-referenced block ÷ total documents |

### 11.2 Lagging Indicators (Weeks to Months Post-Launch)

| Metric | Target | Measurement |
|---|---|---|
| Spec database as single source of truth | > 80% of a workspace's product specs entered in Arther within 90 days | Spec field population rate per workspace |
| Portal consumption | Published documents viewed by external visitors within 30 days of publication | document_viewed events per published document |
| Stale document rate | < 5% of published documents with unresolved staleness flags at any time | Stale document count ÷ total published documents |
| Zero-result portal searches | < 10% of all portal searches return zero results | portal_searched events where results_count = 0 ÷ total |
| Workspace retention | > 80% of workspaces active (at least one document published) at 90 days | Workspace activity tracking |

---

## 12. Open Questions

All blocking open questions from the spec development process have been resolved. The following are non-blocking questions for ongoing refinement:

| Question | Owner | Status |
|---|---|---|
| What is the optimal chunking strategy for AI generation of long documents (100+ page installation manuals)? | Engineering | Non-blocking — can be addressed during implementation |
| Should the portal search index product specs directly, or only published document content? | Product | Non-blocking — product-level search can be added post-launch |
| What is the right threshold for flagging anomalous AI generation volume per workspace? | Product + Engineering | Non-blocking — analytics event model provides monitoring data |
| How should the Brand Profile editor handle font licensing for PDF rendering? | Design + Legal | Non-blocking — can default to system fonts at launch |
| What is the migration path if Anthropic's API pricing changes materially? | Engineering + Business | Non-blocking — single-provider decision is architectural, not contractual |

---

## 13. Timeline Considerations

### 13.1 Hard Dependencies

- The Spec Database must be functional before the AI Generator can be tested with real data.
- Document Types and Brand Profiles must exist before any document can be generated (admin setup prerequisite).
- The Collaboration & Review notification system must be built early — it is the delivery channel for Smart Spec Tracking alerts and Content Reuse notifications.

### 13.2 Suggested Phasing

**Phase 1 — Foundation:** Workspace Admin, Spec Database (with import), core data model, canDo/attribution/auth guardrails.

**Phase 2 — Generation & Editing:** AI Document Generator, Visual Block Editor, Smart Spec Tracking. This phase produces the core "spec in → document out" loop.

**Phase 3 — Collaboration & Publishing:** Collaboration & Review (including unified notifications), Publishing Portal (including PDF generation). This phase completes the full lifecycle.

**Phase 4 — Advanced Capabilities:** Content Reuse, Product Variants, Analytics surfaces, Onboarding assistant. These layer on top of the complete lifecycle.

### 13.3 Dogfood-First

Arther is designed to be dogfooded internally before external launch. The billing UI, free tier, and enterprise pricing are all deferred to post-dogfood. The product should be used internally to produce real documentation before it is offered to external customers.

---

## Appendix A: Spec Document Index

| Document | Version | Scope |
|---|---|---|
| Product Overview | — | High-level product description, strategic goals, competitive positioning |
| Product Synthesis | — | Cross-spec conflict resolution, architectural invariants, deferred items |
| Spec Database Architecture | v1.5 | Data model, field types, import, frontend |
| AI Document Generator | v1.2 | Generation pipeline, block source taxonomy, brand/quality |
| Visual Block Editor | v1.2 | Block types, rich text model, editor UX, export |
| Smart Spec Tracking | v1.3 | Two-speed updates, domain ownership, action dashboard |
| Publishing Portal & Export | v1.2 | Frozen artifacts, portal structure, access control |
| Collaboration & Review | v1.1 | State machine, approval workflow, comments, notifications |
| Content Reuse | v1.1 | Snippets, templates, override model, variant awareness |
| Product Variants | v1.2 | Delta model, variant-aware documents, merge conflicts |
| External Sync | v1.1 | SpecReconciler, intake modes, mutation taxonomy (deferred) |
| Enterprise Readiness | — | Guardrails: canDo, attribution, decoupled auth |
| Analytics Event Model | v1.0 | 7 events, 3 surfaces, visitor identity model |
| Onboarding | v1.0 | AI assistant, admin checklist, empty states |
| Error Handling & Lifecycle | v1.0 | Archive rules, cascade matrix, pre-flight checks |
| Billing & Pricing | v1.0 | Seat model, included resources, deferred questions |
| Workspace Admin | v1.0 | Roles, members, Document Types, Brand Profiles |
| Connectivity Model | v1.0 | Offline behaviour, local save queue, conflict resolution |

---

*Arther — Product Requirements Document. Version 1.0, May 2026. Consolidates 18 feature specifications into a single authoritative requirements document for an AI-native technical documentation platform targeting hardware companies. Defines the complete v1 scope across four core modules (Spec Database, AI Generator, Block Editor, Publishing Portal) and ten cross-cutting capabilities, with explicit non-goals, architectural invariants, build order, and success metrics.*
