# Arther — AI Document Generator: Feature Specification

**Version:** 1.2
**Date:** May 2026
**Status:** Specification complete — greenfield design
**Changes in v1.1:** Section 3.3 updated to add structural blocks as a fifth source type. Section 3.6 updated to document release-pinned inline tag behaviour. Section 5.4 updated to address component-level brief fragment blast radius. Section 5.7 added covering the Product Brief editing surface. Section 5.8 added covering generation failure states and retry policy.
**Changes in v1.2:** All blocking open questions resolved. Section 3.7 added covering LLM provider strategy (single provider: Claude, no abstraction layer at v1). Section 3.8 added covering Document Type versioning behaviour (existing docs untouched; regeneration offer surfaced on demand). Section 6.6 updated (null spec field → placeholder block, equivalent to missing brief fragment). Three open questions closed and moved to Design Decisions. Open questions section reduced to non-blocking items only.

---

## 1. Overview

### 1.1 Purpose

The AI Document Generator is the moment where Arther's structured data becomes a document. It takes the Product Spec Database as its primary input, applies document structure from a Document Type definition, enforces output quality from a Document Quality Standard, and produces a typed block array — a structured document draft that flows directly into the Visual Block Editor for refinement and publication.

The generator is not a prompt interface. It is not a chat window. It is a deterministic pipeline that knows exactly what data it has, what structure it is generating into, and what quality bar it is held to. Every block it produces is traceable to its source.

### 1.2 The Core Constraint: Zero Hallucination Tolerance

Hardware documentation has zero tolerance for invented content. A motor controller datasheet with a fabricated input range, a plausible-sounding but incorrect application, or an efficiency figure the AI inferred rather than read — any of these is a safety liability, a regulatory exposure, and a trust-destroying failure. The generator must never produce content it cannot ground in data Arther owns and can verify.

This constraint is not a quality aspiration. It is a hard architectural rule that shapes every design decision in this feature.

### 1.3 Role in Arther

The AI Document Generator sits between two other features:

- **Upstream:** Product Spec Database — the structured, versioned source of truth the generator reads from
- **Downstream:** Visual Block Editor — the editing surface that receives the generator's output as a typed block array

The decisions made in this document — the block source taxonomy, inline spec reference tags, the Product Brief data model, and the block schema metadata — are upstream constraints on the block editor. The block editor cannot be fully specified until this document is complete.

---

## 2. Who Uses This

### Technical Writers (Primary)

The primary actor. Technical writers initiate document generation, select document type and product, review the generated output in the block editor, and publish to the portal. They interact with the generator's output more than the generator itself — but they experience its quality and completeness immediately. A technical writer's trust in Arther lives or dies in the first document they generate.

**Jobs they accomplish with the generator:**
- Generate a complete structured first draft from a product's spec database, ready to refine rather than write from scratch
- Understand immediately what sections are complete, what sections are awaiting brief content, and what action to take next
- Regenerate individual sections when spec fields change without losing manual editing work

### Product Engineers and Spec Owners

Own the spec data the generator draws from. They are indirect users of the generator — they don't operate it directly, but their work (filling in spec fields, writing Product Brief fragments) determines what the generator can produce. They also trigger regeneration offers when spec changes surface stale inline values.

### Workspace Admins

Configure the document type definitions, document quality standards, and brand profiles that control generation behaviour. For companies that customise their documentation standards heavily, the admin role is a significant one.

---

## 3. Core Concepts

### 3.1 The Two Input Layers

The generator draws from exactly two types of input. Both are native to Arther. Neither is sourced from outside Arther's system boundary.

**Layer 1 — Spec Fields.** Structured, typed, versioned field values from the Product Spec Database. Every electrical parameter, mechanical dimension, performance curve, and compliance flag. This is the primary input for most technical sections of a document.

**Layer 2 — Product Brief.** A set of named freeform text fragments attached to a product or component within Arther. Not spec fields — they have no type system, no unit registry, no tolerance model. They are the narrative layer: what this product is for, who buys it, what makes it different, what regulatory context applies. They are written and owned by humans inside Arther, which is what makes them safe to generate from.

Anything not covered by these two layers produces a placeholder block, not invented content.

### 3.2 The Product Brief

The Product Brief is a native Arther construct that lives alongside the Product Spec Database. It is not a separate application or a connector to an external tool — it is part of Arther's data model, with ownership, edit history, and a last-updated timestamp.

**The Brief mirrors the graph model of the spec database.** Just as components exist as independent entities that products compose, brief fragments live on the entities that own them — products or components — not as a flat document-level appendage. When generating a document about Product A, the generator assembles brief context from Product A's brief fragments and the brief fragments of each component in its graph. A Motor Controller component can carry a narrative description that appears in every product that references it, without duplication.

**Named fragment keys define the brief's structure.** Each fragment has a key that document type sections reference explicitly. Standard fragment keys include:

| Key | Contents |
|---|---|
| `overview` | What the product is and why it exists |
| `target_applications` | Use cases and target markets |
| `key_differentiators` | What makes it better than alternatives |
| `regulatory_context` | CE, UL, ATEX — the narrative around certifications |
| `compatibility_notes` | What it works with, what it doesn't |

Brief fragments are freeform text. They do not have typed sub-fields, required formats, or validation. Their discipline comes from the humans who write them, not the system.

### 3.3 Block Source Taxonomy

Every block in an Arther document has a source. The source determines what metadata the block carries, what system behaviours it participates in, and what actions are available in the editor.

**Spec-referenced blocks** draw their content from spec fields. They carry a `BlockSpecReference` (defined in the Spec Database document) at the block level, and may contain inline spec reference tags within their prose. They participate in Smart Spec Tracking — staleness alerts, automatic inline value updates, and section-level prose flagging.

**Brief-referenced blocks** draw their content from Product Brief fragments. They carry a `BlockBriefReference` at the block level. When a brief fragment is edited, Arther identifies affected brief-referenced blocks and surfaces a light staleness indicator — not the same urgency as a spec change, but visible enough to prompt a review.

**Placeholder blocks** are generated when a section's required brief fragment does not yet exist. They are not content — they are structured gaps. They carry a `PlaceholderBriefReference` that identifies which brief fragment key on which entity would unlock generation. They render distinctly in the editor, cannot be published, and are resolved when the brief fragment is added and the user accepts the automatic generation offer.

**Manually authored blocks** are blocks a technical writer creates directly in the block editor, unconnected to spec or brief data. They carry no source reference and participate in no automated tracking. They are the writer's own words.

**Structural blocks** are section headers and dividers produced by the document type definition itself — not by AI generation. They define the document's skeleton: section titles, visual dividers, and page breaks that the document type requires regardless of what data exists. They carry no source reference and participate in no automated tracking. Unlike manually authored blocks, structural blocks are not created by the writer — they are emitted automatically by the generator as the scaffolding within which all other blocks are placed.

### 3.4 Document Types

A Document Type is a generation schema — not a visual template, not a section outline, but a structured definition of how to produce a specific kind of hardware document. It encodes product domain knowledge: what a good datasheet contains, what a good installation manual requires, which data belongs in which section.

Each section within a Document Type carries an explicit **data contract**:
- Which spec field categories map to this section (Electrical, Mechanical, Performance, etc.)
- Which Product Brief fragment keys this section draws from
- Whether brief content is required for generation or optional (determines placeholder vs. omission behaviour)
- What block types this section produces by default
- Which Document Quality Standard constraints apply at the section level

Document Types are not the same as SpecTemplates (which define expected spec field structure for a product category) and are not the same as document templates in a content reuse sense. The naming is deliberate: a Document Type defines *what kind of document this is and how to generate it*.

Arther ships a curated set of **built-in Document Types** covering the most common hardware documentation formats. These are maintained by Arther and improve over time. Users can **fork** a built-in to create an editable workspace copy, or create Document Types from scratch.

**Built-in Document Types at launch:**
- Datasheet
- Installation Manual
- User Guide / Owner's Manual
- Quick Start Guide
- Declaration of Conformity

### 3.5 Brand Profiles and Document Quality Standards

These are two distinct configuration concepts that were previously conflated under "Style Profile." They are separated because they serve different masters, change at different cadences, and are maintained by different people.

**Brand Profile** is workspace-level identity configuration. It does not change per document type — it applies across all documents a workspace produces. It controls: logo, colour palette, typography, voice and tone descriptors, and the workspace glossary (preferred terminology and prohibited terms). A hardware company with two product lines might have two Brand Profiles. A workspace admin owns Brand Profiles.

**Document Quality Standard** is a set of generation output constraints that enforce documentation discipline across all documents that reference it. It controls things a technical writer would enforce on every document: section length limits, required structural elements, voice and mood rules for specific block types, and conditions metadata requirements. A Document Quality Standard is referenced by Document Types. One standard can apply across multiple Document Types. A documentation lead or workspace admin owns Document Quality Standards.

The generator consumes both independently. Brand Profile shapes presentation. Document Quality Standard shapes output discipline. They do not overlap.

### 3.7 LLM Provider Strategy

Arther uses **Claude (Anthropic) as the sole AI generation provider at v1**. No provider abstraction layer is built. The generation pipeline calls the Anthropic API directly.

This is a deliberate scoping decision, not an oversight. Building a provider abstraction layer — routing generation through a provider-agnostic interface that could swap between Claude, OpenAI, and others — adds meaningful implementation complexity before there is evidence that provider optionality creates customer value. Hardware documentation generation at the volumes Arther expects does not require multi-provider routing.

**API key management:** A single Arther platform-level Anthropic API key is used. API keys are not configurable per workspace at v1. Workspace-level API key configuration is a post-launch capability if enterprise customers require it.

**Model selection:** The specific Claude model (e.g. Claude Sonnet) used for generation is a backend configuration, not a user-facing setting. Model selection is managed by Arther's engineering team and updated as models improve without requiring spec changes.

### 3.8 Document Type Versioning

When a Document Type definition is updated after documents have been generated from it, the following behaviour applies:

**Existing documents are untouched.** A Document Type edit does not automatically alter, regenerate, or flag any existing document. Documents are stable artefacts — editing the template that produced them does not retroactively change their content. This mirrors the behaviour of editing a Figma component master: instances update only when explicitly acted on, not automatically.

**Generated documents record their Document Type at generation time.** The `GeneratedDocument` interface stores the `document_type_id`. This is sufficient for v1 — it records which type was used, but does not version-lock the type definition itself. Document Type definition versioning (capturing the full type schema at generation time) is a post-launch refinement.

**A regeneration offer is surfaced when the user requests it.** If a writer opens a document and wants to regenerate from an updated Document Type definition, they can trigger full or section-level regeneration manually. The system does not proactively notify document owners when a Document Type changes. The blast radius of a Document Type edit is too broad to notify automatically — a single type may have generated hundreds of documents across a workspace.

**Archived Document Types** block new document creation from that type but do not affect existing documents generated from them. Existing documents remain editable and publishable.

### 3.6 Inline Spec Reference Tags

Within prose blocks, spec values are not plain text. They are **structured inline tags** — rendered to the user as the formatted value ("18–54 V DC") but backed by a field ID and version reference. When the underlying spec field changes, the tag updates automatically without touching the surrounding prose.

This is the mechanism that makes the regeneration model safe. "Touch spec values only" is only achievable if spec values in prose are structured artefacts, not characters in a string.

Inline spec tags operate at a different level than block-level `BlockSpecReference` entries:

- **Block-level spec references** exist on every spec-referenced block. They drive staleness alerts and section-level prose flagging.
- **Inline spec tags** exist within the text content of prose blocks. They drive automatic value updates when a field changes.

Both levels are required. A block may carry a block-level reference (alerting that its section should be reviewed) while also containing inline tags (auto-updating the specific values that changed). They are complementary, not redundant.

---

## 4. Data Model

### 4.1 Product Brief

```typescript
interface ProductBrief {
  id: string
  entity_type: 'product' | 'component'
  entity_id: string           // product_id or component_id
  workspace_id: string
  created_at: string
  created_by: string
}

interface BriefFragment {
  id: string
  brief_id: string
  key: string                 // e.g. 'overview', 'target_applications'
  content: string             // freeform text
  updated_at: string
  updated_by: string
}
```

Brief fragments do not carry full version history equivalent to spec field versions — they are not precision data. A last-updated timestamp and editor attribution is the appropriate audit level for narrative content.

### 4.2 Document Type

```typescript
interface DocumentType {
  id: string
  workspace_id?: string       // null for built-in types
  name: string                // 'Datasheet', 'Installation Manual'
  built_in: boolean
  forked_from?: string        // source built-in id if this is a fork
  quality_standard_id?: string
  sections: DocumentTypeSection[]
}

interface DocumentTypeSection {
  id: string
  document_type_id: string
  name: string                // 'Electrical Characteristics', 'Product Overview'
  display_order: number
  spec_field_categories: string[]     // which field category tags map to this section
  brief_fragment_keys: string[]       // which brief fragment keys this section draws from
  brief_required: boolean             // if true and fragment absent: generate placeholder
                                      // if false and fragment absent: omit section silently
  default_block_types: BlockType[]    // what blocks this section produces
  quality_overrides?: QualityConstraint[]  // section-level overrides of the Quality Standard
}
```

### 4.3 Brand Profile

```typescript
interface BrandProfile {
  id: string
  workspace_id: string
  name: string
  logo_url?: string
  primary_colour: string
  typography: {
    heading_font: string
    body_font: string
  }
  voice_descriptors: string[]   // e.g. ['precise', 'confident', 'direct']
  tone_notes?: string           // freeform guidance for the AI
  glossary: {
    preferred_terms: Record<string, string>   // 'motor controller' → 'servo drive'
    prohibited_terms: string[]
  }
  unit_preference: 'metric' | 'imperial' | 'both'
}
```

### 4.4 Document Quality Standard

```typescript
interface DocumentQualityStandard {
  id: string
  workspace_id: string
  name: string
  constraints: QualityConstraint[]
}

interface QualityConstraint {
  scope: 'section' | 'block_type' | 'global'
  target?: string              // section name or block type if scope is not global
  rule: string                 // e.g. 'max_words: 150', 'require_conditions_column: true'
  description: string          // human-readable explanation
}
```

### 4.5 Block Source References

`BlockSpecReference` is defined in the Spec Database document. Two new reference types are introduced here:

```typescript
interface BlockBriefReference {
  block_id: string
  document_id: string
  brief_id: string
  fragment_key: string
  entity_type: 'product' | 'component'
  entity_id: string
  content_snapshot: string     // fragment content at generation time
  generated_at: string
}

interface PlaceholderBriefReference {
  block_id: string
  document_id: string
  entity_type: 'product' | 'component'
  entity_id: string
  fragment_key: string          // the fragment this placeholder is waiting for
  section_name: string          // for display in notification offers
}
```

### 4.6 Inline Spec Tags

Within prose block content, inline spec tags are represented as structured nodes in the block's rich text model (not as plain text):

```typescript
interface InlineSpecTag {
  field_id: string
  field_version_id: string     // version at time of generation or last auto-update
  display_value: string        // rendered string: '18–54 V DC'
  unit_id: string
}
```

When a field's current version changes and the tag's `field_version_id` no longer matches, the tag auto-updates: the display value is recomputed from the new field value and the tag's `field_version_id` is updated. The surrounding prose is not touched.

**Release-pinned documents** are an explicit exception. Documents generated from a named product release carry inline tags locked to the release's field version IDs. When a spec field changes in latest after the release was cut, those tags do not auto-update. The document is documenting a specific release — a change to latest is categorically irrelevant to its accuracy. This is consistent with the Smart Spec Tracking document's treatment of release-pinned documents: they are not affected by changes to latest, and no staleness alerts are generated for them.

### 4.7 Generated Document Output

The generator produces a `GeneratedDocument` — not a finished document, but the initial state of a document entering the block editor:

```typescript
interface GeneratedDocument {
  product_id: string
  release_id?: string          // set if generated from a named release
  document_type_id: string
  brand_profile_id: string
  quality_standard_id?: string
  generated_at: string
  generated_by: string
  blocks: GeneratedBlock[]
}

interface GeneratedBlock {
  type: BlockType
  content: RichTextContent     // includes inline spec tags where applicable
  source: 'spec' | 'brief' | 'placeholder' | 'structural'
  spec_references?: BlockSpecReference[]
  brief_reference?: BlockBriefReference
  placeholder_reference?: PlaceholderBriefReference
  section: string              // which document type section this block belongs to
}
```

`structural` blocks are section headers and dividers produced by the document type definition rather than AI generation — they carry no source reference.

---

## 5. UX and Key User Flows

### 5.1 Initiating Generation

From the document list or from within a product, the user selects **New Document**. They are presented with:

1. **Document Type** — a searchable list of built-in and workspace document types with short descriptions of what each produces
2. **Product** — the product to generate for, with release selector (defaults to latest)
3. **Brand Profile** — workspace brand profiles; typically one per workspace

A **pre-flight completeness summary** is shown before the user confirms generation:

```
Datasheet — Industrial Servo A

  ✓ Electrical Characteristics    spec data complete
  ✓ Performance Curves            spec data complete
  ✓ Mechanical Specifications     spec data complete
  ✓ Environmental Ratings         spec data complete
  ○ Product Overview              brief not yet added
  ○ Applications & Use Cases      brief not yet added
  ○ Key Features                  brief not yet added

  7 of 10 sections will generate fully.
  3 sections will generate as placeholders — brief content needed.

  [Add brief first]   [Generate now]
```

The pre-flight check is computed from the document type's section data contracts against the product's current brief fragment existence. It is deterministic and instantaneous — no generation has started yet.

The user can proceed with placeholders or navigate to add brief content first. Both paths are valid. **There is no blocking gate on generation** — placeholders are a feature, not an error state.

### 5.2 Generation Experience

Generation streams section by section with live status indicators:

```
Generating: Industrial Servo A — Datasheet

  ✓ Electrical Characteristics     complete
  ✓ Performance Curves             complete
  ⧖ Mechanical Specifications      generating...
  ○ Environmental Ratings          queued
  ○ Product Overview               placeholder
  ○ Applications & Use Cases       placeholder
  ○ Key Features                   placeholder
```

Sections marked **placeholder** are not attempted — their status is known from the pre-flight check. Sections marked **queued** or **generating** are live. The user can see the document taking shape in the right panel as sections complete.

When generation finishes, the document opens in the block editor. Placeholder blocks are visually distinct — a muted background, a "Brief needed" label, and a direct link to the specific brief fragment that would unlock generation. They do not look like editable content.

### 5.3 Placeholder Block Behaviour

A placeholder block renders in the editor as:

```
┌─────────────────────────────────────────────────────┐
│  ○  Applications & Use Cases                        │
│                                                     │
│  Brief content needed: target_applications          │
│  Add this to the Product Brief to generate          │
│  this section.                                      │
│                                                     │
│  [Go to Product Brief →]                            │
└─────────────────────────────────────────────────────┘
```

Placeholder blocks:
- Cannot be selected for editing (they are not editable content)
- Are excluded from word counts and document completeness metrics
- Block publishing — the publishing flow surfaces an explicit warning listing all placeholder blocks, with links to resolve them
- Are not counted as stale by Smart Spec Tracking (they contain no spec data)

### 5.4 Automatic Generation Offer

When a user saves a Product Brief fragment, Arther runs a background check: which documents contain placeholder blocks waiting for this specific fragment key on this entity?

If any are found, a notification surfaces:

```
Brief updated — ready to generate

  3 documents have sections ready to generate
  now that 'target_applications' has been added
  to Industrial Servo A.

  [Review and generate →]
```

The review screen lists the affected documents and their placeholder sections. The user opts in per-document — generation is never triggered automatically without confirmation. This mirrors the pattern established by Smart Spec Tracking: the system knows the state, surfaces the opportunity, and the human decides.

When the updated brief fragment belongs to a **component** rather than a product directly, the offer may span multiple products. A Motor Controller component's `target_applications` fragment affects every product that references that component and every document containing a placeholder block for that fragment key across all those products. The notification surface communicates this explicitly — surfacing the component name and the products affected — so the user understands why a single component brief edit produces a broad generation offer:

```
Brief updated — ready to generate

  'target_applications' was added to Motor Controller v2.1,
  referenced by Industrial Servo A, Conveyor Drive B, and
  Next-gen Servo C.

  8 documents across 3 products have sections ready to generate.

  [Review and generate →]
```

### 5.5 Inline Spec Tag Auto-Update

When a spec field value changes in the Spec Database, the system identifies all inline spec tags backed by that field ID across all documents. Tags in published or approved documents are updated automatically and the document's last-updated timestamp is refreshed. Tags in draft documents are updated and the section is flagged for prose review.

The prose review flag appears in the block editor as a subtle section-level banner:

```
⚠ Spec values in this section were updated automatically.
  Review surrounding prose for accuracy.   [Mark as reviewed]
```

This is not a blocking state — the writer can continue editing and publishing. It is an attention signal that the system cannot resolve on their behalf.

### 5.6 Regeneration Flow

When a stale block alert is surfaced (from Smart Spec Tracking), the writer has two options per block:

**Update inline values** — auto-updates all inline spec tags within the block and flags the section for prose review. The writer's manual edits to surrounding prose are preserved entirely.

**Regenerate block** — replaces the block's full content with a fresh generation from the current spec data and brief content. The writer's manual prose edits are lost. This option is presented with a clear warning and a before/after preview.

Bulk regeneration at the section or document level is also available — useful when a major spec revision affects many sections. Bulk regeneration always presents a before/after diff for review before applying.

### 5.7 Product Brief Editing Surface

The Product Brief editing surface lives within the Product Spec Database UI, accessible as a tab on any product or component page alongside its spec fields:

```
Industrial Servo A
[Spec Fields]  [Product Brief]
```

**Default state — fragment key list.** The Product Brief tab shows all expected fragment keys for this entity across the centre panel, with completeness status:

```
Industrial Servo A — Product Brief

  ✓ overview                   added
  ✓ regulatory_context         added
  ○ target_applications        needed by 2 documents
  ○ key_differentiators        needed by 2 documents
  ○ compatibility_notes        not yet added
```

Fragment keys marked `○` with "needed by X documents" carry a direct count of placeholder blocks waiting to be resolved. This makes the downstream consequence of filling in a brief fragment visible at a glance without requiring the user to open any document.

**Expanded editing state.** Selecting a fragment key expands the editing surface across both centre and right panels — the same pattern as the table field editor in the spec database. The fragment key list collapses to a narrow strip on the left edge of the centre panel:

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to brief    target_applications                         │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │  REFERENCED BY               │
│  [text editing area]             │  Datasheet — Servo A         │
│                                  │  Section: Applications       │
│                                  │                              │
│                                  │  Installation Manual — Srv A │
│                                  │  Section: Intended Use       │
│                                  │                              │
│                                  │  GUIDANCE                    │
│                                  │  Describe the primary use    │
│                                  │  cases and target markets.   │
│                                  │  Focus on industries and     │
│                                  │  application types, not      │
│                                  │  technical specifications.   │
│                                  │                              │
│  Last edited: J. Park · 2h ago   │                              │
└──────────────────────────────────┴──────────────────────────────┘
```

The right strip of the expanded view shows two things: the document sections that reference this fragment (so the writer can see downstream context while writing) and per-fragment guidance text explaining what good content looks like for this specific key. Guidance text is Arther-defined — baked into the standard fragment keys, not user-configurable.

The text editing area supports **plain text only**. Brief fragments are AI generation inputs — the AI reads semantic content, not formatting. Rich text adds no generation value and introduces presentation decisions that belong in the block editor, not the brief.

**Component-level briefs** follow the same pattern. A Motor Controller component accessed through either the Component Library or a product's component graph shows the same [Spec Fields] / [Product Brief] tab structure. The shared component banner applies: editing a component's brief fragments affects all products that reference it, and the propagation behaviour mirrors spec field edits.

### 5.8 Generation Failure States

AI API calls fail. The generator has a defined policy for each failure mode:

**Complete failure before any section generates** — the output is discarded entirely. No document is created. A clear error message surfaces with a single retry action that restarts the full generation. The pre-flight completeness state is preserved so the user does not need to reconfigure their selections.

**Partial failure mid-stream** — sections that completed successfully are saved as a draft document. The failed section is represented by an **error block** — visually distinct from a placeholder block — with a section-level retry action.

Error blocks:
- Render with a red border and an error label, distinct from the muted background of placeholder blocks, so the cause of incompleteness is unambiguous
- Can be retried individually without regenerating the whole document
- Block publishing, the same as placeholder blocks
- Carry no source reference — they are not spec-referenced or brief-referenced

**Retry behaviour** is always section-level, not full document. If five sections generated successfully and one failed, the user retries that section only. Retry uses the same section data contract and the current spec and brief state at the time of retry — not the state at the time of original generation.

---

## 6. Design Decisions

| Decision | Rationale |
|---|---|
| Single LLM provider at v1 (Claude / Anthropic) | Building a provider abstraction layer before there is evidence of multi-provider demand adds implementation complexity for no customer-visible benefit. Arther's generation volumes do not require multi-provider routing at launch. The abstraction can be added post-launch when and if enterprise customers require it. |
| No provider abstraction layer at v1 | The generation pipeline calls the Anthropic API directly. An abstraction layer is a maintainability feature, not a user-facing one. Its cost — additional interfaces, routing logic, per-provider prompt compatibility — is not justified by v1 needs. |
| Existing documents are untouched when a Document Type changes | Documents are stable artefacts. Retroactively modifying them when a template changes violates editorial ownership — a writer may have deliberately customised the document's structure. Regeneration is available on demand for writers who want to pick up Document Type changes. |
| No proactive notification on Document Type edits | The blast radius of a Document Type edit is too broad for automatic notification. A single type may have generated hundreds of documents across a workspace. Notifying every document owner for every type edit would overwhelm the notification surface. Writers who want to pick up changes can trigger regeneration manually. |
| Null spec field → placeholder block, not skip or fabrication | A spec field exists on the component but has no value entered yet. This is analogous to a missing brief fragment. Both represent known gaps in the input data. Treating them identically — producing a placeholder block — gives the writer the same legible, actionable incomplete state regardless of whether the gap is a missing brief or an unfilled spec field. Silently skipping the field would hide the gap; fabricating a value violates the zero-hallucination constraint. |
| No external connectors as generation sources | External sources (Google Drive, Confluence, Notion) cannot be verified for freshness or accuracy by Arther. Pulling from them imports a staleness problem Arther has no visibility into. The reliability guarantee only holds if Arther controls the provenance of everything the generator touches. |
| Product Brief as a native Arther construct | Narrative content must live somewhere. Generating without it produces hollow documents; generating with external sources introduces unverifiable inputs. Native brief fragments are owned by Arther, have edit history, and are safe to generate from. |
| Product Brief mirrors the graph model | Components are shared across products in the spec database. Their narrative descriptions should be shared in the same way. A Motor Controller component brief fragment appears in every product that references it — without duplication, and with a single place to update it. |
| Placeholder blocks, not section omission or AI fabrication | Omission makes the document feel broken. Fabrication violates the zero-hallucination constraint. Placeholder blocks make incompleteness legible and actionable — the writer sees exactly what's missing and what would resolve it. |
| Placeholder blocks cannot be published | An accidental publish of a document with unfilled placeholders would be a trust-destroying failure. Publishing validation enforces this as a hard gate, not a soft warning. |
| Automatic generation offer, not auto-generation | The human decides when to trigger generation on their documents. Auto-generation without confirmation violates editorial ownership. The offer model delivers the right timing without removing agency. |
| Slot-filler generation model, not free authoring | Free AI authoring introduces structural variance and unpredictable information architecture. The slot-filler model produces consistent, predictable documents by encoding section structure and data mapping in the document type definition. The AI's latitude is prose quality within defined constraints, not structural decisions. |
| Section-level spec injection, not full field dump | Injecting only the fields relevant to the section being generated reduces token cost, eliminates irrelevant signal, and prevents the AI from making cross-section data allocation decisions. The field→section mapping is an explicit design artefact in the document type definition, not an AI judgment. |
| Inline spec tags as structured nodes, not plain text | "Touch spec values only" during regeneration is only reliable if spec values in prose are addressable artefacts, not characters in a string. Structured inline tags enable surgical auto-update without prose mutation. Without this, regeneration must choose between wholesale replacement (destroys edits) or string matching (fragile and error-prone). |
| Brand Profile and Document Quality Standards as separate concepts | They serve different masters, change at different cadences, and are owned by different people. Brand Profile is identity — workspace-level, design-owned. Document Quality Standard is editorial discipline — applies across document types, documentation-lead-owned. Conflating them creates a configuration surface that serves neither owner well. |
| Built-in Document Types are forkable, not directly editable | Users get a workspace copy to customise. Arther retains the ability to improve canonical document types — adding sections, refining data contracts, updating quality defaults — without affecting workspaces that have already adopted them. Same pattern as SpecTemplates in the spec database. |
| Pre-flight completeness check before generation | Because document type sections have explicit data contracts, completeness is knowable before generation starts. Surfacing it pre-flight sets accurate expectations, removes the surprise of placeholder blocks, and creates a natural entry point to the Product Brief without making it a blocking prerequisite. |
| Section-level prose flagging, not algorithmic staleness detection for contextual content | The system can identify which sections contain updated inline tags. It cannot reliably determine whether prose that references those concepts contextually (without citing values directly) is now inaccurate. That judgment belongs to the technical writer. Section-level flagging hands them the right scope of attention without pretending the system can make that call. |
| Product Brief editor uses plain text, not rich text | Brief fragments are AI generation inputs. The AI reads semantic content, not formatted markup. Rich text adds no generation value and would introduce presentation decisions that belong in the block editor, not the brief. Keeping the editor plain removes a class of authoring decisions that don't improve output quality. |
| Product Brief editing surface lives in the spec database UI | The brief is entity-level data — attached to products and components, not to documents. It belongs alongside the spec fields it complements, not inside the document editor. Placing it in the spec database UI creates one place where all product truth lives: spec fields and narrative context together. |
| Component-level brief edits propagate across all referencing products | This mirrors the graph model of the spec database. A component's brief fragment is shared data, not per-product data. Editing it in one place is the point — the same reason spec field edits on a shared component propagate to all products that reference it. The automatic offer notification makes the blast radius explicit so users are not surprised. |
| Error blocks are visually distinct from placeholder blocks | Both block publishing. But their causes are different — a placeholder block is waiting for human input; an error block failed for a technical reason. Conflating them would make it unclear to a writer whether they need to write brief content or retry a failed request. The visual distinction preserves actionability. |
| Retry is section-level, not full document | Regenerating a full document to recover from a single section failure would destroy completed sections that the user may have already reviewed. Section-level retry is proportionate to the failure and preserves work. |
| Release-pinned inline tags do not auto-update on latest changes | A document generated from a named release is documenting that release. A change to latest is categorically irrelevant to its accuracy. Auto-updating release-pinned tags would undermine the entire point of releases — the ability to generate and maintain accurate documentation for multiple product versions simultaneously. |

---

## 7. Open Questions

The three blocking open questions (multi-provider strategy, Document Type versioning, null spec field behaviour) are resolved — see Section 3.7, Section 3.8, and Design Decisions respectively.

| Question | Notes | Blocking? |
|---|---|---|
| Document Type editor UX | What is the authoring surface for creating and editing Document Type definitions? Given that sections have explicit data contracts (field category mappings, brief fragment keys, quality constraints), the editor is non-trivial. Should it be a structured form or something more visual? | Can resolve during build |
| Brief fragment versioning depth | Brief fragments currently carry only a last-updated timestamp and editor attribution — not the full immutable version history of spec fields. Is this sufficient, or do brief-referenced blocks need to track a specific content snapshot for staleness detection purposes? `BlockBriefReference` includes `content_snapshot` as a starting point, but the policy needs definition. | Can resolve during build |
| Compliance and regulatory generation agents | Some document types (Declaration of Conformity, safety data sheets) follow highly prescribed formats defined by regulatory standards. Should these be handled by specialised generation logic — effectively a regulatory agent with its own rules — or does the Document Type definition model accommodate them sufficiently with strict data contracts and quality constraints? | Can resolve during build |

---

## 8. Out of Scope

**External connectors as generation sources.** Google Drive, Confluence, Notion, and other external tools will not be used as generation inputs. The staleness and provenance problems they introduce are irreconcilable with Arther's zero-hallucination guarantee. If a customer's narrative content exists in Confluence, the correct workflow is to write the relevant Product Brief fragments in Arther — not to pull from Confluence at generation time.

**AI-drafted Product Brief content.** Offering to draft a brief from spec data introduces the same hallucination risk as generating without a brief — the AI invents applications and differentiators the product may not have. Brief fragments are written by humans who know the product.

**Free-form AI document authoring.** The generator does not accept open-ended prompts and does not author documents without a Document Type definition. It is a structured pipeline, not a chat interface.

**Multi-language document generation.** Hardware documentation has extremely low tolerance for translation errors. This requires validated quality assurance infrastructure before building and is explicitly deferred from v1.

**Batch generation across multiple products simultaneously.** Generating documents for an entire product catalogue in one operation. Useful eventually, but the quality review workflow for batch output needs careful design and is out of scope for the initial generator.

---

*Arther — AI Document Generator: Feature Specification. Version 1.2, May 2026. Greenfield specification covering the Product Brief data model and editing surface, Document Type generation schemas, block source taxonomy (including structural blocks), inline spec reference tags and release-pinned behaviour, regeneration model, generation failure states and retry policy, Brand Profile / Document Quality Standard separation, component-level brief blast radius, generation UX, LLM provider strategy (Claude only, no abstraction layer at v1), Document Type versioning behaviour, and null spec field placeholder behaviour. Intended as the authoritative design reference for this feature bucket, upstream of the Visual Block Editor specification.*
