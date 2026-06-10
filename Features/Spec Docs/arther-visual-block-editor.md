# Arther — Visual Block Editor: Feature Specification

**Version:** 1.2
**Date:** May 2026
**Status:** Specification complete — greenfield design
**Changes in v1.1:** Section 3.8 added to document auto-save model and optimistic document lock. Section 4.4 updated to add `ToCBlock`. BlockType union updated to include `'toc'`. Block base interface updated to clarify `section` field is computed at read time, not stored. Section 4.9 updated with container default empty state and edit-mode expand behaviour. Sections 5.9–5.11 added covering image upload UX, cross-block operations, and find and replace. Section 3.7 updated with Quality Standard word count indicators in the outline sidebar. Design Decisions and Open Questions updated throughout.
**Changes in v1.2:** PDF renderer changed from Typst to headless Chrome throughout. DOCX export removed: `DegradationConfig` reduced to PDF only; DOCX preview sub-mode removed; DOCX static contract column removed from tables. `code_block` and `callout` added to `BlockType` union with full TypeScript interfaces, source taxonomy, and static contracts. Section 5.12 added covering document-wide search. Blocking open questions on comment anchoring and undo/redo resolved — see Design Decisions and Feature 6 reference. Open Questions updated.

---

## 1. Overview

### 1.1 Purpose

The Visual Block Editor is the surface where AI-generated documents become finished products. It receives the typed block array produced by the AI Document Generator, provides the editing environment where technical writers refine that output, and produces the document state that flows into the Publishing Portal and export pipeline.

The editor's job is precisely scoped: it is a structured editing environment for technical documentation, not a general-purpose word processor, not a design canvas, and not a prompt interface. Its constraints are as deliberate as its capabilities.

### 1.2 Role in Arther

The Visual Block Editor sits between two other features:

- **Upstream:** AI Document Generator — produces the initial typed block array the editor receives. The block schema, source taxonomy, and inline spec token model established in that document are upstream constraints this feature inherits.
- **Downstream:** Publishing Portal and Export — receives the document's block array and renders it to two targets: interactive web portal and PDF via headless Chrome. Every block type defined in this document must have a fully specified rendering contract for both targets.

### 1.3 The Editor's Primary Constraint

The editor is not a blank canvas. In normal operation, a technical writer opens the editor to find a document already populated — AI-generated blocks, spec-linked content, and placeholder blocks where brief content is missing. The primary editing action is refinement of generated output, not authoring from scratch. This shapes every interaction model decision in this document.

It also means the editor must preserve what the generator produced. Spec field references, block source metadata, and inline token links are not incidental — they are the mechanism that makes Smart Spec Tracking work downstream. The editor cannot silently destroy them.

---

## 2. Who Uses This

### Technical Writers (Primary)

The primary actor. Technical writers receive AI-generated drafts in the editor and refine them into published documents. They edit prose around locked spec tokens, insert additional tokens, manage block order, configure Spec Table rows, author container block content, and publish to the portal. The editor's quality directly determines whether Arther earns their trust after the first document.

**Jobs they accomplish in the editor:**
- Refine AI-generated prose without losing spec field linkages
- Insert spec tokens into manually authored paragraphs
- Configure Spec Table display — which fields to show, in what order, with what labels
- Add and configure media blocks (images, hotspot images, videos)
- Build container block content (accordion sections, wizard steps)
- Review staleness alerts and decide whether to update inline values or regenerate
- Publish documents to the portal

### Product Engineers and Spec Owners (Secondary)

Indirect users of the editor. They are unlikely to author blocks directly but may open the editor to review documents before approval, inspect which spec fields a document references, and respond to staleness alerts surfaced by the outline sidebar. The editor's spec reference visibility — which block came from which field — is relevant to them.

### Reviewers and Approvers

Access the editor in a read-only review mode. They read the document, leave block-level comments, and approve or request changes. They do not edit blocks. The review workflow that surfaces this mode is specified in the Collaboration and Review feature document; the block editor's responsibility is to render consistently in review mode and anchor comments to specific blocks.

---

## 3. Core Concepts

### 3.1 Block-First Model

Every element of an Arther document is a block. Paragraphs are blocks. Section headers are blocks. Tables, charts, images, warnings, and accordions are blocks. There is no freeform document layer underneath the blocks — the block array is the document.

This model is not chosen for stylistic reasons. It is the only model under which spec field references can be anchored precisely, staleness tracking can operate at block granularity, and static contracts for PDF and DOCX export can be deterministically applied. A freeform prose model cannot support any of these.

Writers interact with a continuous vertical canvas of blocks. Blocks can be selected individually, reordered by drag, and inserted via slash commands. The document's visual output — portal, PDF, DOCX — is a rendering of this block array, not the canvas itself.

### 3.2 The Token Model

Within prose blocks, spec field values are not plain text. They are **inline spec tokens** — structured nodes in the block's rich text model that render as their formatted value but are backed by a field ID and version reference.

When a technical writer reads a paragraph like:

> The motor operates at a rated voltage of 36 V with an input range of 18–54 V DC.

The values `36 V` and `18–54 V DC` are tokens, not characters. The surrounding prose is freely editable. The tokens are not.

This distinction is the mechanism that makes surgical spec updates safe. When the rated voltage field changes, the token's display value updates automatically and the surrounding prose is untouched. No regeneration, no content scanning, no fragile string matching.

**Tokens are atomic.** A range field (`18–54 V DC`) is a single token representing the whole range, not two tokens for min and max. A toleranced field (`24 V ±5%`) is a single token. This is a deliberate constraint: it forecloses sentence constructions that reference only one bound of a range field with a live token, but it prevents the system from needing to understand sub-field addressing and keeps the data model clean.

**Writers can insert tokens manually** using the slash command `/spec`, which opens a two-level searchable picker: product → component → field. The primary product is surfaced first; other workspace products appear below. This enables writers to author spec-linked content from scratch — not just refine AI-generated content — and to reference fields from multiple products within a single document.

**Multi-product token scope** operates at the token level, not the generation level. Every document has one primary product for generation, release tracking, and staleness priority. Manually inserted tokens may reference any product in the workspace. The document model does not prohibit this; the generator does not produce it automatically.

### 3.3 Block Source Taxonomy

Every block carries a source that determines what system behaviours it participates in. This taxonomy is established in the AI Document Generator document and carried forward here unchanged:

- **Spec-referenced** — generated from spec field data. Carries `BlockSpecReference` entries. Participates in Smart Spec Tracking. May contain inline spec tokens.
- **Brief-referenced** — generated from Product Brief fragment content. Carries a `BlockBriefReference`. Surfaces a light staleness indicator if the brief fragment is edited.
- **Placeholder** — generated when a required brief fragment is absent. Not editable. Blocks publishing. Carries a `PlaceholderBriefReference` identifying which brief fragment key on which entity would unlock generation.
- **Manual** — authored directly by the technical writer. Carries no source reference. Participates in no automated tracking. The writer owns this content entirely.
- **Snippet** — a live transclusion from the Snippet Library. Carries a `snippet_id`. Content is resolved at render time from the library, never stored on the block. Not editable in the block canvas — edited at the snippet source.

### 3.4 Container Model and Nesting

Three block types are designated **containers**: Accordion, Step Wizard, and the safety blocks (Warning, Caution, Note). Containers hold child blocks. All other block types are **leaf blocks** — they cannot contain other blocks.

Nesting is limited to one level. A container cannot contain another container. An Accordion section cannot contain a Step Wizard. A Step Wizard step cannot contain a Warning block. This constraint is enforced structurally by the data model and the editor UI.

The permitted child block types for each container are explicitly defined in the data model (Section 4.11). Writers cannot insert arbitrary block types inside containers.

This model gives the editor everything hardware documentation actually needs — expandable sections, installation step sequences, structured safety notices — without inheriting the complexity of a full recursive block tree. Every rendering target handles one level of nesting predictably.

### 3.5 Edit Mode and Preview Mode

The editor operates in one of two distinct modes at any time.

**Edit mode** is the working surface. Spec tokens render as chips — a light background, the formatted value, and the field name on hover. Block handles, drag affordances, and the slash command interface are active. The properties panel reflects the selected block. This mode looks like an editor because it is one.

**Preview mode** renders the document as it will appear to a portal visitor or PDF reader. Tokens render as their plain formatted values — no chip, no background, visually identical to surrounding prose. Block handles disappear. The editor chrome is hidden. Writers see exactly what their document becomes after publication.

Preview mode has two sub-modes selectable by tab: **Portal** (interactive web rendering) and **PDF** (headless Chrome-rendered static layout at the document's configured page size). Each sub-mode applies the correct static contracts for interactive blocks. A Step Wizard that renders as an interactive flow in Portal preview becomes a numbered list in PDF preview.

The mode split resolves a fundamental problem: chip-styled tokens must not be confused with the document's rendered output. A writer in edit mode should never wonder whether the chip background will appear in the published PDF. It will not — and Preview mode makes that unambiguous.

### 3.6 Static Contracts

Every interactive block type has a **static contract** — a defined, non-interactive rendering that preserves its semantic content when interactivity is unavailable. Static contracts apply in PDF and DOCX export, and appear as-rendered in Preview mode.

Static contracts have a **default** per block type, enforced automatically by Arther. Writers can override the static contract for any individual block in the properties panel — but the default is pre-selected and most writers will never touch it.

| Block type | Default PDF static contract |
|---|---|
| Accordion | Flat sections: each section rendered as a heading followed by its content |
| Step Wizard | Numbered list: each step title and content in sequence |
| Video | Static thumbnail image with URL as a caption below |
| GIF | First frame rendered as a static image |
| Hotspot Image | Static image with numbered pins overlaid + legend table below |
| Chart | Static image rendered at export time from the current table field data |
| Code Block | Rendered as a styled monospace block with syntax highlighting preserved as best-effort static HTML |
| Callout | Rendered as a visually boxed section with icon and title — native in PDF |
| Snippet | Resolved content rendered inline — identical to its portal appearance |

Paragraph, Heading, Image, Spec Table, Section Header, Divider, Warning, Caution, Note, Code Block, and Callout blocks render natively in PDF without a static contract — they are non-interactive by nature.

### 3.7 The Three-Panel Layout

The editor is organised as three persistent panels:

**Outline sidebar (left)** — a navigable tree of the document's section structure. Each section header is listed with two status indicators: a staleness indicator (amber `●`) for sections containing stale blocks, and a word count indicator showing the section's current length against its Document Quality Standard limit if one is configured. When a section exceeds its limit, the word count turns amber. Writers can jump to any section directly. The outline is always visible and does not collapse — for long documents, it is the primary navigation surface.

**Block canvas (centre)** — the editing surface. The ordered sequence of blocks for the current document. Blocks render in their edit-mode appearance. The canvas is a continuous vertical scroll with no page boundary indicators — page layout is a PDF rendering concern, not an editing concern.

**Properties panel (right)** — context-sensitive. When no block is selected, it shows document-level properties: title, primary product, brand profile, document type, and page size. When a block is selected, it shows that block's properties: type, source metadata, degradation configuration, and type-specific controls (row picker for Spec Tables, pin list for Hotspot Images). The properties panel is always open; it does not slide in or out.

### 3.8 Auto-Save and Document Locking

The editor auto-saves continuously as the writer works — every change is persisted to the working copy immediately, with no explicit save action required. A "Last saved" timestamp in the editor header confirms the current save state. There is no save button.

**Optimistic document lock.** Because Arther does not support real-time co-editing, auto-save creates a data integrity risk if two writers have the same document open simultaneously — the later save would silently overwrite the earlier one. The editor resolves this with a lightweight optimistic lock: when a writer opens a document that another user already has open, a banner appears:

```
Jane has this document open. Your changes may conflict with hers.
[Open read-only]   [Edit anyway]
```

"Open read-only" gives the second writer a non-editable view of the current working copy. "Edit anyway" dismisses the warning and proceeds — the writer accepts the conflict risk. When the first writer closes the document, the lock releases and any other open session becomes the active editor.

The lock is advisory, not enforced. It protects against accidental simultaneous editing; it does not guarantee conflict-free writes for writers who knowingly dismiss it.

---

## 4. Data Model

### 4.1 Block Base Interface

All block types extend a common base. Fields defined here are present on every block regardless of type.

```typescript
interface Block {
  id: string
  document_id: string
  type: BlockType
  parent_block_id?: string        // null for top-level blocks; set for blocks inside containers
  display_order: number           // position within parent (document or container section/step)
  source: BlockSource
  spec_references?: BlockSpecReference[]        // from Spec Database feature doc
  brief_reference?: BlockBriefReference         // from AI Document Generator feature doc
  placeholder_reference?: PlaceholderBriefReference  // from AI Document Generator feature doc
  snippet_id?: string             // set when source is 'snippet'
  degradation: DegradationConfig
  section: string                 // document type section this block belongs to
                                  // computed at read time from the nearest SectionHeaderBlock
                                  // above this block in document order — not stored on the block
                                  // updates automatically when blocks are reordered
  created_at: string
  created_by: string
  last_edited_at?: string
  last_edited_by?: string
}

type BlockSource = 'spec' | 'brief' | 'placeholder' | 'manual' | 'snippet'

type BlockType =
  // Structural
  | 'section_header'
  | 'divider'
  | 'page_break'
  | 'toc'               // table of contents — auto-generated from section headers
  // Prose
  | 'heading'
  | 'paragraph'
  | 'code_block'        // monospace code or configuration snippets
  | 'callout'           // highlighted informational box (distinct from safety blocks)
  // Data
  | 'spec_table'
  | 'chart'
  // Safety
  | 'warning'
  | 'caution'
  | 'note'
  // Media
  | 'image'
  | 'video'
  | 'gif'
  | 'hotspot_image'
  // Interactive containers
  | 'accordion'
  | 'step_wizard'
  // Reuse
  | 'snippet'
```

### 4.2 RichTextContent and Inline Spec Tokens

Prose blocks use a structured rich text model rather than a plain string. This model supports the full formatting capability set and accommodates inline spec tokens as first-class nodes alongside text.

```typescript
interface RichTextContent {
  alignment: 'left' | 'center' | 'right' | 'justify'
  nodes: RichTextNode[]
}

type RichTextNode = TextNode | InlineSpecTokenNode | LinkNode

interface TextNode {
  type: 'text'
  text: string
  marks: TextMark[]
}

type TextMarkType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'superscript'
  | 'subscript'
  | 'inline_code'
  | 'text_color'
  | 'highlight'

interface TextMark {
  type: TextMarkType
  color?: string    // hex value; only present for 'text_color' and 'highlight' marks
                    // defaults to the Brand Profile palette; custom hex permitted
}

interface InlineSpecTokenNode {
  type: 'spec_token'
  field_id: string
  field_version_id: string      // the version at time of generation or last auto-update
  display_value: string         // rendered string: '18–54 V DC', '36 V', '−20 to +85 °C'
  unit_id: string
  product_id: string            // which product this token references
  component_id: string          // which component the field belongs to
}

interface LinkNode {
  type: 'link'
  href: string
  nodes: (TextNode | InlineSpecTokenNode)[]
}
```

**Token rendering in edit mode:** `InlineSpecTokenNode` renders as a chip — light background, formatted `display_value`, cursor changes to pointer on hover. Hovering shows a tooltip: field name, component name, product name. Clicking opens a popover with the field's full detail and a link to navigate to that field in the Spec Database. Tokens are not editable from this popover — the Spec Database is where values are changed.

**Token rendering in preview mode:** `InlineSpecTokenNode` renders as its plain `display_value` with no chip styling, visually indistinguishable from surrounding `TextNode` content.

**Font family and font size are intentionally absent from the mark type set.** Typography is controlled by the Brand Profile at workspace level. Allowing per-mark font overrides would break brand consistency across documents. Writers control weight, style, decoration, and colour — not typeface or size.

### 4.3 DegradationConfig

Each block carries a degradation configuration specifying how it renders in PDF and DOCX when its interactive behaviour is unavailable. The `default` flag indicates whether the selected contract is the Arther-enforced default or a writer override.

```typescript
interface DegradationConfig {
  pdf: DegradationContract
  // DOCX export removed from v1 scope — PDF is the only static export target
}

interface DegradationContract {
  type: DegradationContractType
  default: boolean              // true if this is the Arther default; false if writer-overridden
}

type DegradationContractType =
  | 'native'                    // block renders fully in this target without transformation
  | 'flat_sections'             // accordion: each section as heading + content
  | 'numbered_list'             // step wizard: steps as a numbered list
  | 'static_image'              // chart, gif: rendered as a static image
  | 'first_frame'               // gif: first frame as static image
  | 'thumbnail_with_url'        // video: thumbnail image + URL caption
  | 'numbered_legend'           // hotspot image: image with pin numbers + legend table
  | 'omit'                      // block is excluded from this render target entirely
```

Structural blocks (Section Header, Divider, Page Break), prose blocks (Paragraph, Heading, Code Block, Callout), data blocks (Spec Table), safety blocks (Warning, Caution, Note), and Image blocks always have `type: 'native'` for PDF — they render correctly without transformation.

### 4.4 Structural Blocks

```typescript
interface SectionHeaderBlock extends Block {
  type: 'section_header'
  title: string
  document_type_section_id?: string   // references DocumentTypeSection.id if AI-generated
                                       // null for manually inserted section headers
}

interface DividerBlock extends Block {
  type: 'divider'
  // no additional properties
}

interface PageBreakBlock extends Block {
  type: 'page_break'
  // affects PDF pagination only; has no visual effect on the portal or DOCX
  // rendered in edit mode as a labelled dashed line; invisible in portal preview
}

interface ToCBlock extends Block {
  type: 'toc'
  title?: string                  // optional caption, e.g. 'Table of Contents'
  depth: 1 | 2 | 3               // heading levels to include:
                                  // 1 = SectionHeaderBlocks only
                                  // 2 = SectionHeaderBlocks + H2 HeadingBlocks
                                  // 3 = SectionHeaderBlocks + H2 + H3 HeadingBlocks
  // content is generated at render time by reading the document's block array
  // never stored on the block — always reflects the current section structure
  // portal: renders as anchor links to each section
  // PDF: renders as a standard table of contents with page numbers via headless Chrome
}
```

### 4.5 Prose Blocks

```typescript
interface HeadingBlock extends Block {
  type: 'heading'
  level: 2 | 3    // H2 and H3 only; document and section titles are handled by
                  // SectionHeaderBlock; H1 is reserved for document title
  content: RichTextContent
}

interface ParagraphBlock extends Block {
  type: 'paragraph'
  content: RichTextContent    // may contain InlineSpecTokenNodes where spec values appear
}

interface CodeBlock extends Block {
  type: 'code_block'
  content: string             // plain text; not rich text — no marks or inline tokens
  language?: string           // syntax highlighting hint: 'bash', 'json', 'yaml', 'python', etc.
                              // null = no syntax highlighting applied
  caption?: string            // optional label rendered below the block
  // source: always 'manual' — code blocks are never AI-generated
  // degradation: native in PDF — rendered as a styled monospace block
}

interface CalloutBlock extends Block {
  type: 'callout'
  variant: 'info' | 'tip' | 'important'  // controls icon and colour accent
                                           // info: blue / tip: green / important: orange
  title?: string              // short bolded heading above the callout body
  content: RichTextContent    // body text; may contain inline spec tokens
  // Callout is distinct from safety blocks (Warning/Caution/Note):
  // — safety blocks have legally defined styling and are non-themeable
  // — callouts are informational highlights with Brand Profile-compatible accent colours
  // — callouts do not imply risk or safety guidance
  // source: 'manual' or 'spec' — callouts may be generated to highlight key spec values
  // degradation: native in PDF — rendered as a styled box with title and body
}
```

### 4.6 Data Blocks

**Spec Table**

The Spec Table block renders a structured table of spec field values for a product. It is a live view over the spec database — field values are read at render time, never stored on the block itself. Writers configure which fields appear and how they are displayed; they do not enter or override values.

```typescript
interface SpecTableBlock extends Block {
  type: 'spec_table'
  product_id: string              // the product whose spec fields populate this table
  title?: string                  // optional table caption
  column_config: SpecTableColumnConfig
  rows: SpecTableRow[]
}

interface SpecTableColumnConfig {
  show_min: boolean               // for range and toleranced fields: show min bound column
  show_typical: boolean           // for scalar and toleranced: show typical/nominal column
  show_max: boolean               // for range and toleranced fields: show max bound column
  show_conditions: boolean        // show the conditions annotation column
  show_source: boolean            // show rated / typical / measured / calculated
  unit_preference: 'metric' | 'imperial' | 'workspace_default'
  decimal_places?: number         // optional: override displayed precision
}

interface SpecTableRow {
  field_id: string                // references SpecField.id
  component_id: string            // which component this field belongs to
  display_order: number           // writer-controlled ordering, independent of spec db order
  display_label?: string          // overrides the field's name for this document only
                                  // null means use the field's name as-is
  visible: boolean                // writer can hide a row without removing it from the config
                                  // hidden rows are excluded from all render targets
}
```

**Cell-level value overrides are explicitly not supported.** If a value displayed in a Spec Table needs to differ from the spec database value, the correct action is to create a product-level scalar override in the Spec Database — not to override the display value in the document. This preserves staleness tracking integrity. Display overrides (label, visibility, ordering) are document-local and are not spec mutations.

**Chart**

Chart blocks are views over table-type spec fields. They have no independent data — the field is the data source. This is specified in the Spec Database feature document and enforced here: there is no "chart data entry" in the block editor.

```typescript
interface ChartBlock extends Block {
  type: 'chart'
  table_field_id: string          // references a SpecField with type: 'table'
  product_id: string
  title?: string
  chart_type: 'line' | 'scatter' | 'bar'
  x_axis_label?: string           // overrides column name for display
  y_axis_label?: string
  show_legend: boolean
  show_grid: boolean
  // degradation default: static_image (chart rendered at export time)
}
```

### 4.7 Safety Blocks

Warning, Caution, and Note are distinct block types with enforced visual treatment. They cannot be reduced to styled paragraphs — the distinction between a Warning (risk of injury) and a Note (informational) is legally meaningful in hardware documentation under ISO 82079 and ANSI Z535.6. Enforcing them as separate types prevents a writer from accidentally styling a Warning as a Note.

Each safety block is a container. Its child blocks are a constrained set defined in Section 4.11.

```typescript
interface WarningBlock extends Block {
  type: 'warning'
  title?: string                  // defaults to 'WARNING'; overridable for localisation
  children: SafetyBlockChild[]
  // visual treatment: red left border, hazard icon, bold title — enforced, not themeable
}

interface CautionBlock extends Block {
  type: 'caution'
  title?: string                  // defaults to 'CAUTION'
  children: SafetyBlockChild[]
  // visual treatment: amber left border, caution icon, bold title — enforced, not themeable
}

interface NoteBlock extends Block {
  type: 'note'
  title?: string                  // defaults to 'NOTE'
  children: SafetyBlockChild[]
  // visual treatment: blue left border, info icon, bold title — enforced, not themeable
}

// Child block types permitted inside safety blocks — see Section 4.11
type SafetyBlockChild = ParagraphBlock | HeadingBlock | ImageBlock
```

The visual treatment of safety blocks — colours, icons, border style — is defined by Arther and is not configurable through the Brand Profile. Hardware documentation safety standards require consistent, recognisable safety notice styling. Brand customisation of safety notice appearance is a compliance risk.

### 4.8 Media Blocks

```typescript
interface ImageBlock extends Block {
  type: 'image'
  url: string
  storage_key: string             // internal reference to Arther's file storage
  alt_text: string                // required; used in DOCX export and accessibility
  caption?: RichTextContent       // rendered below the image in all targets
  width: 'full' | 'half' | 'quarter'   // layout hint for portal and PDF rendering
  // degradation: native in all targets
}

interface VideoBlock extends Block {
  type: 'video'
  url: string                     // external URL (YouTube, Vimeo) or internal storage key
  thumbnail_url?: string          // auto-extracted from provider or manually set
  caption?: RichTextContent
  autoplay: boolean               // portal only; always false for PDF/DOCX targets
  // degradation default: thumbnail_with_url
}

interface GIFBlock extends Block {
  type: 'gif'
  url: string
  storage_key: string
  alt_text: string
  caption?: RichTextContent
  // degradation default: first_frame
}

interface HotspotImageBlock extends Block {
  type: 'hotspot_image'
  url: string
  storage_key: string
  alt_text: string
  caption?: RichTextContent
  pins: HotspotPin[]
  // degradation default: numbered_legend
}

interface HotspotPin {
  id: string
  number: number                  // display label: ①②③ — auto-assigned, recomputed on reorder
  x_percent: number               // 0–100, position relative to image width
  y_percent: number               // 0–100, position relative to image height
  label: string                   // text description of this region (MVP)
  spec_field_id?: string          // post-MVP: links pin to a spec field for live value display
  spec_product_id?: string        // post-MVP: which product the linked spec field belongs to
}
```

**Hotspot Image — PDF static contract detail:** The numbered_legend contract composites pin number markers at their `x_percent / y_percent` positions onto the static image, then renders a two-column legend table below: pin number | label text. All pin information is preserved in a non-interactive form. This compositing is handled by the export pipeline, not the editor.

**Hotspot Image — post-MVP evolution:** The `spec_field_id` and `spec_product_id` fields on `HotspotPin` are included in the schema now to avoid a migration when spec-linked hotspots are built. At MVP, they are always null. When populated, hovering a pin on the portal shows the field's current value from the spec database. The pin participates in Smart Spec Tracking via a `BlockSpecReference` at the block level.

### 4.9 Interactive Container Blocks

**Accordion**

```typescript
interface AccordionBlock extends Block {
  type: 'accordion'
  sections: AccordionSection[]
  // degradation default: flat_sections
  // default empty state on insertion: one section with empty title, one empty
  // paragraph child. Cursor placed in the title field ready to type.
  // All sections are always expanded in edit mode regardless of default_open —
  // collapse/expand behaviour is a portal interaction only.
}

interface AccordionSection {
  id: string
  title: string
  display_order: number
  default_open: boolean           // whether this section is expanded by default on the portal
  children: AccordionChild[]
}

// Permitted child block types inside accordion sections — see Section 4.11
type AccordionChild =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | WarningBlock
  | CautionBlock
  | NoteBlock
  | SpecTableBlock
  | ChartBlock
```

**Step Wizard**

```typescript
interface StepWizardBlock extends Block {
  type: 'step_wizard'
  steps: WizardStep[]
  // degradation default: numbered_list
  // default empty state on insertion: one step with empty title, one empty
  // paragraph child. Cursor placed in the title field ready to type.
}

interface WizardStep {
  id: string
  title: string
  display_order: number
  children: WizardStepChild[]
}

// Permitted child block types inside wizard steps — see Section 4.11
type WizardStepChild =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | WarningBlock
  | CautionBlock
  | NoteBlock
  | SpecTableBlock
  | ChartBlock
```

### 4.10 Reuse Blocks

```typescript
interface SnippetBlock extends Block {
  type: 'snippet'
  snippet_id: string              // references the snippet in the Snippet Library
  snippet_name: string            // cached display name; for editor UI only
  last_resolved_at?: string       // timestamp of last render-time resolution; for display
  // snippet content is never stored on this block
  // it is resolved from the Snippet Library at render time (portal, PDF, DOCX)
  // and at edit-time display in the block canvas
}
```

Snippet content is always live — whatever is in the Snippet Library at render time is what appears in the document. There is no snapshot or version pinning at the block level. When a snippet is updated in the library, all documents containing a `SnippetBlock` referencing it reflect the change immediately on next render.

Snippets may contain spec tokens. Those tokens are owned by the snippet's block structure, carry their own `BlockSpecReference` entries, and participate in Smart Spec Tracking normally. A stale token inside a snippet surfaces a staleness alert on every document that embeds that snippet — which is the correct behaviour, since the displayed value is wrong everywhere.

### 4.11 Permitted Child Block Types per Container

| Container | Permitted child block types |
|---|---|
| AccordionSection | Paragraph, Heading, Image, Warning, Caution, Note, Spec Table, Chart |
| WizardStep | Paragraph, Heading, Image, Warning, Caution, Note, Spec Table, Chart |
| Warning / Caution / Note | Paragraph, Heading, Image |

Containers cannot contain other containers. The editor enforces this structurally — the slash command inside a container section does not offer Accordion, Step Wizard, or Snippet as insertable types. Snippet blocks are not permitted inside containers because snippet content may itself contain containers, and resolving nested container-in-container at render time produces undefined behaviour in static export targets.

---

## 5. UX and Key User Flows

### 5.1 Three-Panel Layout

```
┌──────────────────┬────────────────────────────────────────┬───────────────────────┐
│  OUTLINE         │  BLOCK CANVAS                          │  PROPERTIES           │
│                  │                                        │                       │
│  1. Overview   ● │  ▌ Product Overview                    │  [no block selected]  │
│  2. Electrical   │                                        │                       │
│  3. Performance  │  The Industrial Servo A is a           │  Document             │
│  4. Mechanical   │  high-torque servo drive rated at      │  Industrial Servo A   │
│  5. Compliance   │  [36 V] with an input range of         │                       │
│                  │  [18–54 V DC]. Designed for...         │  Brand Profile        │
│                  │                                        │  Arther Industrial    │
│                  │  ┌─────────────────────────────┐       │                       │
│                  │  │  ○  Applications & Use Cases │       │  Document Type        │
│                  │  │  Brief content needed        │       │  Datasheet            │
│                  │  │  [Go to Product Brief →]     │       │                       │
│                  │  └─────────────────────────────┘       │  Page Size            │
│                  │                                        │  A4                   │
│                  │  ELECTRICAL CHARACTERISTICS            │                       │
│                  │                                        │  Release              │
│                  │  [Spec Table]                          │  Latest               │
└──────────────────┴────────────────────────────────────────┴───────────────────────┘
```

The `●` indicator on section 1 in the outline sidebar signals a staleness alert in that section. The outline is the writer's first signal that attention is needed somewhere in the document without requiring a full scroll.

### 5.2 Block Insertion

Writers insert blocks using the slash command `/` at any position in the canvas. Typing `/` opens the block picker — a searchable list of all block types grouped by category. Typing additional characters filters the list. Selecting a block type inserts it at the cursor position.

```
/ →

  STRUCTURAL          PROSE           DATA
  Section Header      Paragraph       Spec Table
  Divider             Heading H2      Chart
  Page Break          Heading H3

  SAFETY              MEDIA           CONTAINERS
  Warning             Image           Accordion
  Caution             Video           Step Wizard
  Note                GIF
                      Hotspot Image   REUSE
                                      Snippet
```

Inside a container section or step, the slash command filters to permitted child block types only. Container types and Snippet do not appear.

### 5.3 Spec Token Insertion

Writers insert spec tokens using `/spec` within any prose block. This opens the token picker — a two-level searchable interface showing products, components, and fields.

```
/spec → [search fields...]

  PRIMARY PRODUCT
  ▼ Industrial Servo A
    ▼ Motor Controller v2.1
        Rated Voltage          36 V        scalar
        Input Range         18–54 V DC     range
        Operating Temp      −20–85 °C      range
        Rated Current          8.5 A       scalar
    ▼ Encoder Module
        Resolution           2048 CPR      scalar
        Max Speed            6000 RPM      scalar

  OTHER PRODUCTS
  ▼ Industrial Servo B
    ▼ Motor Controller v2.2
        Rated Voltage          48 V        scalar
```

Selecting a field inserts an `InlineSpecTokenNode` at the cursor position with the field's current value as `display_value` and the current `field_version_id`. The token immediately renders as a chip.

### 5.4 Block Selection and the Properties Panel

Clicking anywhere on a block selects it. Selection is indicated by a left accent bar on the block and activates the properties panel. Clicking outside any block deselects.

**Properties panel — block selected:**

```
┌─────────────────────────┐
│  BLOCK PROPERTIES       │
│                         │
│  Type: Paragraph        │
│  Source: spec           │
│                         │
│  Spec References        │
│  · Rated Voltage        │
│    Motor Controller     │
│    v3 (current) ✓       │
│  · Input Range          │
│    Motor Controller     │
│    v2 ⚠ stale           │
│                         │
│  DEGRADATION            │
│  PDF:  native     [↓]   │
└─────────────────────────┘
```

The spec references panel shows which fields this block references, their current version status, and whether the block is stale. Stale references show the version at generation and the current version. The writer can navigate to the field in the Spec Database from this panel.

**Properties panel — Spec Table selected:**

```
┌─────────────────────────┐
│  SPEC TABLE             │
│                         │
│  Product                │
│  Industrial Servo A [↓] │
│                         │
│  COLUMNS                │
│  ☑ Min  ☑ Max           │
│  ☑ Typical              │
│  ☑ Conditions           │
│  ☐ Source               │
│                         │
│  ROWS  [+ Add field]    │
│  ↕ Rated Voltage        │
│  ↕ Input Range          │
│  ↕ Operating Temp  [✕]  │
│  ↕ Rated Current        │
│                         │
│  DEGRADATION            │
│  PDF:  native     [↓]   │
└─────────────────────────┘
```

Row ordering is drag-controlled within the list. The `[✕]` removes a row from the table. `[+ Add field]` opens the field picker for this product. Display label override is accessible by clicking a row name.

**Properties panel — Hotspot Image selected:**

```
┌─────────────────────────┐
│  HOTSPOT IMAGE          │
│                         │
│  [Replace image]        │
│                         │
│  PINS                   │
│  ① Power input          │
│  ② Status LED      [✕]  │
│  ③ CAN bus connector    │
│  [+ Add pin]            │
│                         │
│  DEGRADATION            │
│  PDF: numbered   [↓]    │
│       legend            │
└─────────────────────────┘
```

### 5.5 Block Reordering

Each block shows a drag handle (⠿) on its left edge, visible on hover. Writers drag blocks to reorder them within the document. Blocks cannot be dragged into containers via drag — adding blocks inside a container uses the slash command from within that container's editing context.

Multi-select is supported via shift-click on block drag handles. Multi-selected blocks can be moved together or deleted together. No other bulk operations are supported at v1.

### 5.6 Edit Mode and Preview Mode

The mode toggle is persistent in the editor header: `[Edit]  [Preview ▾]`. Preview opens a dropdown: Portal / PDF.

Switching to any preview mode:
- Hides the properties panel
- Hides drag handles and block selection affordances
- Renders tokens as plain values
- Applies static contracts to all interactive blocks
- PDF preview renders in the centre panel at the document's page size, with page boundaries visible as shadows

Switching back to edit mode restores all editor affordances. Preview mode is not editable — all interactions in preview mode are read-only.

### 5.7 Staleness Indicators in the Outline Sidebar

The outline sidebar reflects the document's staleness state without requiring a full canvas scroll:

```
  1. Product Overview     ●
  2. Electrical Specs
  3. Performance Curves   ●
  4. Mechanical Specs
  5. Compliance
```

The `●` indicator appears next to any section containing one or more blocks with stale `BlockSpecReference` entries. Clicking the indicator scrolls the canvas to the first stale block in that section and selects it, opening its spec reference detail in the properties panel.

### 5.8 Snippet Block Behaviour at Edit Time

Snippet blocks render their resolved content in the canvas — a writer sees the snippet's paragraphs, images, and other blocks as they will appear in the published document. But the visual treatment signals clearly that this content is not document-local:

```
┌─ Snippet ──────────────────────────────── [Edit source →] ─┐
│                                                             │
│  WARNING                                                    │
│  Disconnect power before servicing. Failure to do so       │
│  may result in serious injury or death.                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

A persistent top border with a "Snippet" badge and an "Edit source →" link distinguishes the block from document-local content. Clicking anywhere in the block body does nothing — no cursor appears, no editing is permitted. A tooltip on click: "This content is a live snippet. Use Edit source to change it."

"Edit source →" navigates to the snippet in the Snippet Library, where the content can be edited. Changes there propagate to this document and all other documents embedding the same snippet.

When a snippet is updated in the library, a notification appears in the editor for documents that contain it:

```
A snippet in this document was updated.
'CE Compliance Statement' was edited 2 hours ago.
[Review changes]
```

### 5.9 Image Upload

Images enter Arther through two paths:

**Drag-and-drop onto the canvas** is the primary path. As a writer drags an image file over the canvas, a drop indicator line appears between blocks, snapping to the nearest block boundary as the cursor moves. Releasing the file inserts an `ImageBlock` at that position and opens a file upload progress indicator. The same mechanism applies to GIF files, which insert a `GIFBlock`.

Dragging an image file onto an *existing* `ImageBlock` or `GIFBlock` triggers a replace rather than an insert — the existing block's image is replaced with the dropped file. The block's other properties (alt text, caption, width) are preserved.

**File picker** is the secondary path, accessible in two ways: via the slash command (`/image`, `/gif`) which inserts the block and immediately opens the system file picker; or via a "Replace image" button in the properties panel for updating an existing media block.

Accepted file types: PNG, JPG, JPEG, WebP, SVG for `ImageBlock`; GIF for `GIFBlock`. Maximum file size is enforced at upload time with a clear error message. Uploaded files are stored in Arther's file storage and referenced by `storage_key`.

### 5.10 Cross-Block Operations

**Copy and paste within the same document** — all block properties carry over: content, tokens, `BlockSpecReference` entries, source metadata, and degradation configuration. The pasted block is an independent block with a new `id`. Both the original and the copy track the same spec field references and will each surface staleness alerts independently.

**Copy and paste between documents** — content and tokens carry over. `BlockSpecReference` entries carry over with `document_id` updated to the destination document — the data dependency relationship follows the content regardless of how the block arrived. `source` resets to `'manual'` because the writer made a manual editorial decision to include this content. The destination document will surface staleness alerts for the pasted block's spec references from that point forward.

**Block type conversion** — a writer can convert a block to a compatible type without deleting and recreating it. Content and tokens carry over; `source` resets to `'manual'`. Compatible conversions at v1:

| From | To |
|---|---|
| Paragraph | Heading H2, Heading H3 |
| Heading H2 | Heading H3, Paragraph |
| Heading H3 | Heading H2, Paragraph |
| Note | Caution, Warning |
| Caution | Warning, Note |
| Warning | Caution, Note |

**Container block conversion** — converting a container block (Accordion, Step Wizard) to a leaf type, or converting between container types, is a destructive operation that discards child block structure. A confirmation dialog is required before proceeding:

```
Converting this Accordion to a Paragraph will discard its 3 sections and their content.
This cannot be undone.

[Cancel]   [Convert and discard]
```

**Block duplication** — available via the block context menu (right-click or `⋯` handle menu). Follows the same rules as copy-paste within the same document: all properties carry over, new `id` assigned, duplicate inserted immediately below the original.

### 5.11 Find and Replace

Accessible via standard keyboard shortcut (Cmd+F / Ctrl+F). Opens a find bar at the top of the block canvas.

Find operates on **plain text nodes only** — it matches against the text content of `TextNode` items in the rich text model. `InlineSpecTokenNode` display values are explicitly excluded from find and replace. A token displaying `36 V` will not match a search for "36 V" — spec values are changed in the Spec Database, not via find and replace.

Replace follows the same scope: replacements are applied to plain text nodes only. Replacing text adjacent to a token does not affect the token. This constraint is enforced at the model level, not through UI restrictions — the writer does not need to know about it.

Find results are highlighted across all blocks in the document. Navigation arrows cycle through matches. Replace All applies to all plain text matches in the current document in a single operation with a count confirmation: "Replace 14 occurrences of 'motor controller' with 'servo drive'?"

### 5.12 Search

Search operates across four distinct scopes, each accessible from the global search bar in the application header (Cmd+K / Ctrl+K):

**Full-text document search** — searches across the text content of all documents in the workspace. Results are listed by document, with a short text excerpt showing the match in context. Clicking a result opens the document and scrolls to the first matching block. Match scoring is term frequency in document content; spec token display values are included in the indexed text so writers can search for "36 V" and find documents where that value appears in a token.

**Spec field search** — searches across all spec field names and values in the Spec Database. Results are grouped by component. Clicking a result opens that field in the spec database editor. This provides a fast entry point to the spec database from anywhere in the editor without navigating the product/component tree.

**Block library search** — searches across all blocks in the workspace's documents. Useful when a writer knows a block with specific content exists somewhere and wants to reuse it or create a snippet from it. Results display the block's source document and section.

**Within-document search** — scoped to the currently open document. Accessible via Cmd+F / Ctrl+F (Section 5.11, Find and Replace). This is the fastest path for navigating to a known location within a long document.

The global search bar (Cmd+K) defaults to full-text document search. Scope switching is available via tab selectors in the search panel: Documents | Spec Fields | Blocks.

---

## 6. Design Decisions

| Decision | Rationale |
|---|---|
| Block-first, not document-first | The only model under which spec field references can be anchored precisely at the block level, staleness tracking can operate at block granularity, and static contracts can be deterministically applied per block type. A freeform document model cannot support any of these. |
| Token model over edit-and-break-link or edit-and-preserve-link | Edit-and-break-link destroys staleness coverage on every edited block. Edit-and-preserve-link allows writers to manually type incorrect values while the block's spec reference claims accuracy. Tokens make spec values non-editable while leaving prose fully free — the only model that is both flexible and correct. |
| Tokens are atomic for range and toleranced fields | Sub-field addressing (referencing only the min bound of a range field) requires the system to understand field sub-properties and produces grammatical constraints the data model cannot validate. The atomic token forecloses some sentence constructions but keeps the model clean and unambiguous. |
| Edit/Preview mode split, not WYSIWYG | Three distinct render targets (portal, PDF, DOCX) make true WYSIWYG impossible — you cannot simultaneously display the correct rendering for all three. A hard mode split makes the distinction explicit. Writers who want to see the rendered output switch to Preview; writers who want to edit stay in Edit mode. |
| Container model with one level of nesting | Hardware documentation needs expandable sections (Accordion) and sequential steps (Step Wizard). It does not need arbitrary nesting. The container model provides what is needed while keeping the data model flat enough that all render targets can handle it predictably. Full recursive nesting was rejected because it compounds complexity across every rendering surface. |
| Static contracts as defaults with per-block override | The default removes all friction for the common case — most writers will never think about degradation. The override exists for the minority of cases where the default isn't right for a specific document. Making overrides available but non-default avoids both the burden of mandatory configuration and the inflexibility of no configuration. |
| No cell-level value overrides in Spec Table | Cell-level overrides would allow a document to display values that differ from the spec database without Arther's knowledge, breaking staleness tracking for that cell. If a rounded or adjusted value is needed for a specific document, the correct place to record it is a product-level scalar override in the Spec Database. This preserves the single source of truth. |
| Display overrides on Spec Table rows are document-local | Row labels, ordering, and visibility are editorial choices that belong to the document author. They do not constitute a change to the spec field itself and should not mutate the spec database. A technical writer naming a row "Supply Voltage" in their datasheet instead of the field's formal name "Supply Voltage Input Range" is making a presentation decision, not a data decision. |
| Warning, Caution, and Note as first-class block types | Hardware documentation safety notices have legally meaningful distinctions defined by ISO 82079 and ANSI Z535.6. Implementing them as styled paragraphs would allow a writer to apply Warning styling to non-Warning content or vice versa — a compliance risk. First-class types with enforced visual treatment prevent this. Their visual appearance is not exposed to Brand Profile theming. |
| Safety block visual treatment is non-themeable | Brand consistency is valuable; compliance is mandatory. A brand that uses amber as its primary colour cannot be permitted to style its Warning notices amber and its Caution notices red — that would invert the safety hierarchy. Arther enforces safe, legible, standards-consistent styling for safety blocks regardless of Brand Profile. |
| Hotspot Image pins are point-based at MVP | Region-based hotspots (drawing bounding polygons over image areas) require a region-drawing authoring tool — a significant scope commitment. Point-based pins (click to place, type a label) deliver the core value of image annotation with a fraction of the authoring complexity. Region drawing is a post-MVP addition once the use case is validated. |
| Font family and font size excluded from rich text | Typography is controlled by the Brand Profile at workspace level. Per-mark font overrides would allow individual writers to break brand consistency on a paragraph-by-paragraph basis. Arther's value proposition includes consistent, on-brand document output — allowing arbitrary font changes undermines this. Writers control emphasis, decoration, and colour; the Brand Profile controls typeface and scale. |
| Text colour defaults to Brand Profile palette with custom override permitted | Pure prohibition of custom colours creates friction for legitimate uses (colour-coded technical annotations, for example). Defaulting to the brand palette guides writers toward consistency while permitting deviation where it is genuinely needed. |
| Snippets are not editable in the block canvas | A snippet is a live transclusion — its content is owned by the Snippet Library, not the document. Allowing inline editing would create the impression of document-local content while actually mutating a shared resource that propagates to other documents. The non-editable treatment with an explicit "Edit source" affordance makes the ownership relationship unambiguous. |
| Snippets cannot be used inside container sections | Snippet content may itself contain container blocks. Resolving a snippet containing an Accordion inside a WizardStep would produce nested containers — a structure the one-level nesting constraint explicitly prohibits and that static export targets cannot handle predictably. |
| Multi-product token scope at token level only, not generation level | Generation from multiple products simultaneously requires the AI to make structural decisions about interleaving two spec graphs — a significantly harder problem with less predictable output. Token-level multi-product scope gives writers the ability to reference any product's spec fields in manually authored content without requiring the AI to solve a harder generation problem. Primary product generation with manual cross-product token insertion covers the real use case: comparison sentences in a document whose primary subject is one product. |
| Auto-save with advisory optimistic lock | Auto-save removes friction and matches the expectation set by every modern editing tool. The advisory lock — warning the second writer rather than blocking them — avoids the scenario where a writer is locked out of an urgent document because a colleague has it open. The cost is a potential write conflict for writers who ignore the warning; this is acceptable given Arther's single-writer-at-a-time collaboration model. |
| Image upload via drag-and-drop and file picker | Drag-and-drop is the natural interaction for inserting visual content into a document canvas. File picker provides an accessible fallback. Drag-onto-existing-block triggers replace rather than insert because the intent is unambiguous — a writer dragging a new image onto an existing photo wants to update it. |
| BlockSpecReference entries carry over on cross-document copy | The data dependency relationship between a block and its spec fields is a property of the content, not of how the content was created. A pasted block that displays spec values should track those values for staleness regardless of whether it was generated or pasted. Dropping BlockSpecReference on paste would silently create documentation blind spots in the destination document. |
| `section` field computed at read time, not stored | Storing the section assignment on each block creates a maintenance problem — every block reorder potentially invalidates stored assignments, requiring cascading updates. Computing from the nearest SectionHeaderBlock above eliminates this entirely. The computation is O(n) on document length and cheap to run at read time. |
| Quality Standard limits surfaced as soft indicators in the outline sidebar | Hard gates on section length would block writers from publishing time-sensitive documents when a section legitimately needs to run long. Soft indicators — word count turning amber in the outline — create awareness without creating friction. The Quality Standard is an editorial guideline, not a publication gate. |
| Find and replace excludes token display values | Spec values are changed in the Spec Database. Allowing find-and-replace to modify token display values would create values disconnected from the database — the token would show the replaced text while still claiming to track the original field. Excluding tokens from find and replace is both architecturally correct and consistent with the broader principle that spec data flows in one direction: from the database into documents. |
| Table of contents as a live block type | A static ToC authored manually goes stale every time a section is renamed or reordered. An auto-generating ToC block that reads the document's SectionHeaderBlock array at render time never goes stale and requires no maintenance. Page numbers in PDF are computed by headless Chrome, which has the layout information needed to do this correctly. |
| PDF renderer: headless Chrome, not Typst | Headless Chrome renders directly from the same HTML/CSS used in the portal, giving WYSIWYG fidelity between the web preview and the PDF output. Typst would require a separate template system and separate rendering logic that must be kept in sync with portal styling. Headless Chrome reuses the existing SSR pipeline and eliminates the class of rendering-divergence bugs where the PDF looks different from the portal. |
| DOCX export removed from v1 scope | Hardware documentation is shared as PDF or via the portal. DOCX is a word processor format optimised for editing, not for distribution of finished technical documentation. Adding DOCX requires mapping every block type to a Word document schema, handling unsupported features (interactive blocks, charts, hotspot images) gracefully, and maintaining a separate rendering pipeline. The investment is not justified by the distribution use case that Arther targets. |
| Code Block content is plain text, not rich text | Code and configuration snippets are consumed verbatim by the reader — formatting within code is whitespace-structural, not typographic. Rich text marks (bold, italic, token insertion) would pollute code content with markup that is meaningless or misleading in a code context. Plain text with syntax highlighting as a rendering concern is the correct model. |
| Callout is distinct from safety blocks | Safety blocks (Warning, Caution, Note) have legally defined styling under ISO 82079 and ANSI Z535.6 and are non-themeable. Callouts are informational highlights for tips, important context, and product notes — they do not carry safety implications and use Brand Profile-compatible accent colours. Conflating them would either force safety blocks to become themeable (a compliance risk) or force callouts to use non-themeable safety styling (an aesthetic constraint). |
| Undo/redo granularity: block-action level | Undo operates at the level of discrete block actions: text entered between pauses (debounced to ~1 second of inactivity), block insertions, block deletions, block reorders, token insertions, property changes. Sub-keystroke undo is too granular and produces confusing behaviour for writers moving quickly. Full-session undo (one undo per edit session) is too coarse. Block-action undo is the granularity writers expect from structured editors. Undo history is per-document, per-session — not persisted across sessions. |
| Comment anchoring: sub-block text anchoring, defined in Feature 6 | Comments from the review workflow anchor at two levels: block level (the comment is associated with the whole block) and text range level (the comment is anchored to a specific text selection within a prose block). The block editor's responsibility is to render comment anchors correctly and to handle the orphaning case — when the anchored text is edited or deleted after the comment is placed. Full specification of the comment model is in the Collaboration & Review feature document (Feature 6). |

---

## 7. Open Questions

The two blocking open questions (comment anchoring model, undo/redo granularity) are resolved — see Design Decisions above and Feature 6 (Collaboration & Review) for the full comment model specification.

| Question | Notes | Blocking? |
|---|---|---|
| Block duplication — spec reference behaviour for manual cross-document paste | When a writer pastes a spec-referenced block into a document whose primary product does not include the referenced component, the BlockSpecReference is preserved but the staleness query for that document will now join across a product the document wasn't generated from. Is this the correct behaviour, or should a warning be surfaced? | Must resolve before build |
| Snippet block inside containers | Currently excluded because snippet content may contain containers, violating the one-level nesting constraint. Is this the right call permanently, or should snippets be permitted inside containers on the condition that their content contains no container blocks? Enforcing that condition would require runtime validation of snippet content at insert time. | Can resolve during build |
| Hotspot Image spec-linked pins — BlockSpecReference model | When a pin's `spec_field_id` is populated (post-MVP), the pin participates in Smart Spec Tracking. Does the pin create a `BlockSpecReference` at the block level (one reference per pin per field), or does the HotspotImageBlock carry a single aggregated reference? | Can resolve during build |
| Version history at the block level | Can a writer see the edit history of a specific block — who changed what prose, when? Block-level edit history requires either storing diffs or full snapshots per block per edit. | Can resolve during build |
| Empty document state | What does the editor look like when a writer creates a document without using the AI generator — building manually from scratch with no generated blocks? Is there an onboarding prompt, a block picker, or just an empty canvas with a slash command hint? | Can resolve during build |
| Token picker scope for workspace with many products | The token picker shows all workspace products under "Other Products." A workspace with 30 products and 50 components each would produce an unwieldy picker. Is there a search-first mode, a recently used products filter, or a per-document product allowlist that limits the picker scope? | Can resolve during build |
| Conflict resolution for advisory lock override | When a writer dismisses the optimistic lock warning and edits simultaneously with another writer, last-write-wins applies. Should the losing writer be notified that their changes were overwritten? This requires either a post-save diff or a version vector comparison. | Can resolve during build |

---

## 8. Out of Scope

**Canvas layout tools.** Positioning blocks at arbitrary coordinates, floating text around images, and multi-column grid layouts are the domain of design tools. Arther is a structured block editor — layout is determined by block order and block width hints, not by xy placement.

**Font family and font size selection.** Typography is Brand Profile territory. Per-mark typeface and size overrides are excluded to protect brand consistency.

**Real-time simultaneous co-editing.** The review workflow — comment, approve, publish — is the correct collaboration model for hardware documentation. Concurrent editing adds architectural complexity without serving the actual workflow. One writer owns a document at a time; others review.

**AI generation from within the editor.** Generation happens in the AI Document Generator before the editor opens. Regeneration of stale blocks is offered via staleness alerts, not via a generation prompt inside the editor. The editor is not a chat interface.

**Custom block types.** A plugin API for custom blocks requires a block type extension system, a rendering contract for each new type across all export targets, and a UX surface for authoring custom properties. This is deferred until Arther has the user scale to justify third-party investment.

**Mobile native editing.** Block editing on a small screen is a poor experience. The portal is already responsive and readable on mobile via browser. The editor targets desktop.

**Brochure and booklet layout modes.** These require a canvas design tool — visual element placement, bleed/margin control, print imposition. Hardware companies that need brochures use Canva or InDesign. Arther's value is in spec-linked structured documentation, not marketing layout.

**DOCX export.** Removed from v1 scope. Hardware technical documentation is distributed as PDF or served via the portal — both of which Arther produces natively. DOCX is a word processor format optimised for editing; the investment in mapping every block type to Word schema is not justified at v1.

**Tabs block type.** Excluded after evaluation. The use cases for tabbed content in hardware documentation are covered by Accordion (collapsible sections) or by variant comparison at the portal level. Tabs add editor and rendering complexity without serving a distinct documentation need.

**ePub export.** Hardware datasheets and installation manuals are not distributed as ebooks.

---

*Arther — Visual Block Editor: Feature Specification. Version 1.2, May 2026. Greenfield specification covering the block-first interaction model, inline spec token model with chip visual treatment and Edit/Preview mode split (Portal and PDF only; DOCX removed), complete block type taxonomy with TypeScript interfaces for 20 block types including Code Block and Callout, container model with one-level nesting constraint and permitted child type tables, Spec Table live-linking and display override model, Hotspot Image MVP pin design and PDF static contract, static contract system with per-block override (PDF only), three-panel layout, document-wide search across documents/spec fields/blocks, and full UX flows for block insertion, token insertion, selection, reordering, snippet behaviour, and find and replace. PDF rendered via headless Chrome. Intended as the authoritative design reference for this feature bucket, downstream of the AI Document Generator and upstream of the Publishing Portal and Smart Spec Tracking feature documents.*
