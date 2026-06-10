# Arther — Spec Database: Feature Specification

**Version:** 1.5
**Date:** May 2026
**Status:** Specification complete — greenfield design
**Changes in v1.1:** Section 3.3 updated to introduce the `ScalarOverride` interface. Section 3.4 updated to add `category` and archival fields. Section 3.10 added covering archival model, deletion rules, orphaned token state, and cascade behaviour.
**Changes in v1.2:** All open questions resolved and folded into the spec. Section 3.4 updated to clarify `required` and `internal_only` behaviour. Section 3.8 updated with release creation workflow. Section 3.10 extended to cover product archival and deletion. Section 4.8 updated with reference field navigation, AI generation behaviour, and circular reference detection. Section 5.5 updated with `display_order` management. Section 5.6 added covering category management. Section 6.2 updated to specify dedicated import review screen. Section 6.3 updated with confirmed launch template categories. Section 6.5 added covering export. Section 6.6 added covering null field state. Design decisions updated throughout. Open questions section removed — all questions resolved.
**Changes in v1.3:** Section 6.7 added covering the spec field comment model — data structure, version context markers, visibility, resolution model, combined comment and version history view, and notification integration. Three new entries added to Design Decisions. FieldComment data model added to Section 3.
**Changes in v1.4:** `BlockSpecReference` updated to include `variant_id` for variant-aware staleness tracking (Feature 9). `SpecField` updated to include `provenance`, `sync_source_id`, and `last_synced_at` fields for future External Sync compatibility — these fields are schema-level only at v1; the External Sync adapter (Feature 8) is deferred post-launch. One new Design Decision entry added.
**Changes in v1.5:** `Component` updated to include `default_category` — a component-level default that pre-fills the field category for new fields, reducing per-field friction while allowing per-field override for cross-discipline fields. Supports the domain ownership model in Smart Spec Tracking.

---

## 1. Overview

### 1.1 Purpose

The Spec Database is Arther's source of truth. Every piece of information that Arther generates, publishes, or tracks flows from it. It is the hardware product's definitive record — a structured, versioned repository of everything that describes a product: its electrical parameters, mechanical dimensions, performance curves, compliance certifications, and component relationships.

Hardware companies today store this information inconsistently — scattered across Excel spec sheets, embedded in ERP or PLM systems, annotated in CAD files, and maintained as informal engineering team knowledge. The Spec Database replaces that fragmentation with a single, authoritative, version-controlled store that feeds all downstream documentation workflows.

### 1.2 Scope

This document specifies the Spec Database as a self-contained feature: its data model, field types, version control system, unit registry, frontend design, and onboarding and import flows. Its connections to the rest of Arther — AI document generation, staleness tracking, webhook sync, portal publishing — are described at the boundary level only.

### 1.3 Role in Arther

The Spec Database is the upstream input to:

- **AI Document Generator** — spec field values are injected at generation time to produce accurate technical drafts
- **Staleness Tracking** — documents store references to the exact spec field versions they were generated from; when a field changes, affected documents surface stale content warnings
- **Webhook Sync** — external ERP and PLM systems push spec updates via webhook; the same reconciliation logic handles both file import and webhook payloads
- **Publishing Portal** — published documents reflect a specific product release from the spec database; portal visitors can see which release a document is based on

---

## 2. Core Concepts

### 2.1 Products and Components

A **product** is the top-level entity — the thing a hardware company designs, manufactures, and sells. "Industrial Servo Motor A", "Conveyor Drive B", "Next-gen Controller C."

A **component** is a discrete unit of a product with its own set of specifications. Components can be assemblies (composed of sub-components) or leaf-level parts. Crucially, components exist as **independent entities** — they are not owned by any specific product.

### 2.2 The Graph Model

The relationship between products and components is a **graph**, not a tree.

The same Motor Controller Assembly may be used in three different products. It has one set of specifications, maintained in one place. Each product that uses it references it — it does not duplicate it. When that assembly's specifications change, all three products are affected simultaneously. This reflects physical reality.

A product's component hierarchy — the tree a user navigates when browsing a product — is a **view computed from the graph** for that specific product. The underlying data is a set of relationship records, not a hierarchy.

### 2.3 Spec Fields

A **spec field** is a named, typed attribute of a component. "Rated Voltage", "Operating Temperature Range", "Speed-Torque Curve", "RoHS Compliant." Each field has a type, a value, and additional metadata: its unit, the measurement conditions under which the value applies, and whether the value is rated, measured, or calculated.

### 2.4 Two Versioning Mechanisms

The Spec Database maintains two distinct versioning systems that serve different purposes and must be designed separately:

**Field version history** is automatic and fine-grained. Every change to any field value creates an immutable record — what changed, from what value, to what value, by whom, when. This powers document staleness detection.

**Product releases** are explicit, named snapshots — "v2.1-release" — that capture the complete state of all field values at a point in time. Document generation can target either the latest state or a specific release. Portal visitors can see which release a document reflects.

### 2.5 The Unit Registry

All numeric field values are associated with a unit from a **structured registry**, never a freetext string. This enables reliable metric/imperial conversion at export time, prevents entering a value in the wrong dimension (voltage where current is expected), and ensures AI generation prompts receive correctly labelled values.

---

## 3. Data Model

### 3.1 Products

```typescript
interface Product {
  id: string
  workspace_id: string
  name: string
  description?: string
  created_at: string
  created_by: string
  archived_at?: string    // null when active; set when archived
  archived_by?: string
}
```

### 3.2 Components

Components exist independently of products. They are the entities that own spec fields.

```typescript
interface Component {
  id: string
  workspace_id: string
  name: string
  type: string            // e.g. "assembly", "module", "part"
  default_category?: string // default field category for new fields added to this component;
                           // selected from the workspace category list (see Section 5.6);
                           // when set, new fields pre-fill their category from this value;
                           // individual fields can override to a different category
  description?: string
  created_at: string
  created_by: string
  archived_at?: string    // null when active; set when archived
  archived_by?: string
}
```

### 3.3 Product Composition — The Graph Edges

```typescript
interface ProductComponent {
  id: string
  product_id: string
  component_id: string
  parent_component_id?: string          // null = top-level; set = nested under a component
  quantity: number
  scalar_overrides: Record<string, ScalarOverride>  // field_id → override; see Section 3.5
}
```

`scalar_overrides` allows a product to use a shared component at a different spec value without mutating the component entity itself. Override rules are covered in section 3.5.

### 3.4 Spec Fields

```typescript
interface SpecField {
  id: string
  component_id: string
  name: string
  type: FieldType
  value: FieldValue            // typed union — see Section 4
  unit_id?: string             // references unit registry; required for all numeric types
  conditions?: string          // measurement context: "at 25°C, 50% load"
  source: 'rated'              // manufacturer's guaranteed specification
          | 'typical'          // characterised but not guaranteed
          | 'measured'         // from actual test data
          | 'calculated'       // derived from other fields
  formula?: string             // if source = 'calculated': formula stored as text
  depends_on?: string[]        // field IDs this field derives from
  options?: string[]           // for enum and multi_enum types
  category: string             // display group: "Electrical", "Mechanical", "Performance", etc.
                               // drives field grouping in the UI and domain ownership routing
                               // selected from workspace-defined category list; see Section 5.6
  required: boolean            // if true: empty value produces a placeholder block at generation
                               // time rather than attempting to generate with missing data;
                               // UI shows an asterisk indicator; does not block publication
  internal_only: boolean       // if true: excluded from portal, PDF, DOCX export, and AI
                               // generation prompts; visible to all workspace members in
                               // the spec database editor
  display_order: number        // position within its category group; managed by drag-to-reorder
  archived_at?: string         // null when active; set when archived
  archived_by?: string
  // --- External Sync provenance (schema present at v1; populated post-launch by External Sync adapter) ---
  provenance: 'manual' | 'sync'  // 'manual' = entered by workspace member (default);
                                  // 'sync' = last written by an External Sync adapter
  sync_source_id?: string        // adapter-assigned identifier for the external record;
                                 // null for manual fields; set by SpecReconciler on sync write
  last_synced_at?: string        // ISO timestamp of last successful sync write; null for manual fields
}
```

### 3.5 Product-Specific Overrides

When a product uses a shared component at a different value than the component's global spec — e.g. the Motor Controller runs at 24V in Product A but 36V by default — the override is stored on the `ProductComponent` relationship row, not on the component entity itself. This mirrors Figma's component/instance model: the component holds the global spec; the product-component relationship holds local overrides.

```typescript
interface ScalarOverride {
  value: FieldValue       // the override value
  set_by: string          // user ID — used to route review notifications when the underlying
                          // component field changes; the person who set the override is the
                          // right person to confirm whether it is still intentional
  set_at: string          // timestamp
}
```

**Overrides are supported for scalar field types only**: `scalar`, `range`, `toleranced`, `enum`, `boolean`. `table` and `reference` fields do not support overrides. If a product requires a different performance curve for a shared component, it references a separate component entity.

**Type change blocking:** If a field has active scalar overrides on any `product_components` rows, changing the field's type is blocked. The UI shows which products hold overrides on the field. The user must navigate to each product and remove the override before the type change can proceed. This prevents silent data loss from orphaned override values.

### 3.6 Unit Registry

```typescript
interface Unit {
  id: string
  name: string            // "Revolutions per minute"
  symbol: string          // "RPM"
  dimension: string       // "angular_velocity"
  si_factor: number       // conversion factor to SI base unit
  custom: boolean         // false = built-in; true = workspace-defined
  workspace_id?: string   // set for custom units; null for built-in
}
```

Values are stored in their **native unit — not converted to SI**. "6000 RPM" is stored as `6000` with `unit_id: 'rpm'`. Conversion to other units (e.g. rad/s, or imperial equivalents) happens only at export and display time, driven by the workspace's unit preference setting.

**Built-in unit coverage:**

- Electrical: V, mV, kV; A, mA; W, kW; Ω, kΩ, MΩ; F, μF, nF, pF; H, mH; Hz, kHz, MHz
- Mechanical: Nm, mNm; RPM; kg, g; kg·m²; mm, cm, m; mm², cm²
- Thermal: °C, K; W/°C (thermal resistance)
- Fluid: bar, PSI; L/min, mL/min
- Derived: Nm/A (torque constant); V/RPM (back-EMF constant)
- Dimensionless: %, dB, CPR (counts per revolution)

Workspace admins can define custom units via Settings, specifying name, symbol, an existing dimension, and the SI conversion factor. The `custom: true` flag distinguishes workspace units from built-in units throughout the system.

### 3.7 Field Version History

Every change to a field's value creates an immutable version record:

```typescript
interface FieldVersion {
  id: string
  field_id: string
  value: FieldValue
  diff: StructuredDiff      // for table fields: row-level diff vs previous version
  changed_by: string
  changed_at: string
  note?: string             // optional annotation explaining the change
}
```

The `diff` for scalar fields records before/after values. For table fields, the diff is structural: which rows were added, removed, or had specific column values changed. Table diffs are never text diffs.

### 3.8 Product Releases

A named snapshot of all field values at a specific point in time:

```typescript
interface ProductRelease {
  id: string
  product_id: string
  name: string              // "v2.1-release"
  tag: string               // semver or freeform (e.g. "v2.1", "FW-2024-Q2")
  created_at: string
  created_by: string
  notes?: string
}

interface ReleaseFieldValue {
  release_id: string
  field_id: string
  version_id: string        // the exact FieldVersion record current at release time
}
```

**Release creation workflow:** Releases are always created by explicit user action — pressing "Create Release" from the product page and providing a name and tag. Releases are never created automatically when individual fields are edited; field edits accumulate in "latest" until the user decides to snapshot them. The one exception is file import, which always creates a release automatically since import is itself a discrete, intentional event.

Retroactive releases are not supported — a release captures the state at the moment of creation. Field version history provides the low-level audit trail for individual fields over time.

**Release deletion:** Blocked if any documents were generated from that release. If no documents reference it, deletion is permitted with a confirmation step.

Document generation supports both "generate from latest" and "generate from a named release." Hardware companies regularly need documentation for products in the field running older firmware — locking generation to latest is not sufficient once a product family has multiple active versions.

### 3.9 Document Layer Connection — Staleness Tracking

Every block in Arther's document editor that references spec data stores a precise reference to the field version it was generated from:

```typescript
interface BlockSpecReference {
  block_id: string
  document_id: string
  field_id: string
  field_version_id: string    // staleness anchor — the version at generation time
  release_id?: string         // set if document was generated from a named release
  variant_id?: string         // set if this reference belongs to a variant document (Feature 9);
                              // null for base documents
  reference_type: 'generated' | 'manually_linked' | 'chart'
}
```

Staleness detection for a document is a single database join — O(n) on blocks, no content scanning, no fuzzy matching:

```sql
SELECT bsr.block_id, f.name, fv_old.value AS at_generation, fv_now.value AS current
FROM block_spec_references bsr
JOIN spec_fields f         ON f.id      = bsr.field_id
JOIN field_versions fv_old ON fv_old.id = bsr.field_version_id
JOIN field_versions fv_now ON fv_now.id = f.current_version_id
WHERE fv_old.id != fv_now.id
  AND bsr.document_id = :documentId
```

A stale block is simply one where the `field_version_id` it was generated from no longer matches the field's current version. A third state — **orphaned** — applies when the source component or field has been archived. See Section 3.10.

### 3.10 Archival and Deletion

#### Two Distinct Operations

**Archive** — reversible. A product, component, or field is removed from all active UI surfaces (Products sidebar, Component Library, product trees, field pickers) and cannot be selected for new document generation or added to new products or documents. All existing data is fully preserved. Existing document references immediately enter an orphaned state (see below). Archive is reversible: restoring a product, component, or field automatically re-evaluates all tokens and documents that reference it.

Individual spec fields can be archived independently of their parent component. Archiving a component implicitly archives all its fields. Archiving a product does not archive its referenced components — components are independent entities and may be used by other active products.

**Hard delete** — permanent. Only permitted when the entity has zero references:
- A **product** can be hard deleted only if no documents were ever generated from it
- A **component** can be hard deleted only if it has no `product_components` rows and no `BlockSpecReference` records
- A **field** can be hard deleted only if it has no `BlockSpecReference` records

If any references exist, the delete is blocked and the UI shows exactly how many products and documents reference the entity. This makes accidental destruction of referenced data structurally impossible rather than just warned against.

#### Product Archival Behaviour

When a product is archived:

1. The product disappears from the Products sidebar and cannot be selected for new document generation
2. All documents generated from it enter `needs_review` state
3. A `DashboardActionItem` is created for each affected document owner
4. `BlockSpecReference` records and `product_components` relationship rows are preserved intact — the historical record of what was generated from this product remains
5. Published portal snapshots continue serving until a document owner explicitly makes a change; the archive event alone does not unpublish anything

#### Orphaned Token State

When a component or field is archived, inline spec tokens in prose blocks do not disappear — they enter an `orphaned` state. The token continues displaying its last known value but is visually flagged in the block editor. The document owner then makes an explicit choice per token:

- **Convert to static text** — the last known value becomes a plain text string, no longer tracked by the spec database
- **Remove** — the token is deleted; the writer repairs the surrounding prose
- **Re-link** — the token is pointed at a replacement component or field

Silently deleting tokens on archive would produce broken sentences delivered to reviewers with no context for what was there. The orphaned state preserves the last known value as context while making the problem unambiguous and actionable.

#### Cascade on Archive

When a component or field is archived, Arther immediately:

1. Marks all `InlineSpecTokenNode` records backed by the archived entity as `status: 'orphaned'`
2. Flags all published documents containing orphaned tokens as `needs_review`
3. Creates a `DashboardActionItem` for each affected document owner
4. Renders `SpecTableBlock` rows sourced from the archived component as greyed-out with an "archived" badge rather than removing them
5. Shows a "data source archived" error state on `ChartBlock` instances linked to a table field on the archived component
6. Preserves all `BlockSpecReference` records — they become the audit trail of what was referenced before the archive

#### Restoration Cascade

When a component or field is restored from archive, all tokens in `status: 'orphaned'` that reference it are automatically re-evaluated without any manual confirmation step:

- If the field value is unchanged since the token was generated → token becomes `current`
- If the field value has changed since the token was generated → token becomes `stale`

`needs_review` flags created by the archive event are cleared if no other review items remain on the document.

### 3.11 Spec Field Comments

Spec field comments are annotations attached to individual spec fields. They are distinct from document block comments (Feature 6) in both intent and lifetime.

Document block comments are presentation feedback — "this sentence is unclear" — tied to a review cycle and expected to be resolved. Spec field comments are data accuracy annotations — "is this impedance value correct?", "updated following hardware revision B sign-off" — that accumulate as a narrative history of why a field value is what it is. They are not tied to a review cycle and are not expected to be resolved and discarded.

```typescript
interface FieldComment {
  id: string
  field_id: string                     // the spec field this comment is attached to
  field_version_id: string             // the field version current at comment creation time
  value_snapshot: FieldValue           // the field's value at comment creation time
  author_id: string
  body: string                         // rich text; may contain @mention tokens
  parent_comment_id?: string           // null = root comment; set = reply (one level max)
  created_at: string
  edited_at?: string
}
```

**Field-attached with version context markers.** Comments are attached to the spec field entity, not to a specific field version. They persist across value changes — a comment thread from six months ago is still accessible when the field's current value has changed several times since. Each comment stores the `field_version_id` and a `value_snapshot` at the time it was written. The combined comment and version history view (Section 6.7) uses these snapshots to render inline context: *"at the time of this comment, the value was 47 Ω."*

This gives the comment thread its full narrative power without requiring comments to be re-anchored or migrated when field values change.

---

## 4. Field Types

### 4.1 Overview

Eight field types cover the full range of information found in hardware spec sheets:

| Type | Description | Example |
|---|---|---|
| `scalar` | Single numeric value + unit | Rated Voltage: 36 V |
| `range` | Min and max sharing a unit | Operating Temp: −20 to +85 °C |
| `toleranced` | Nominal ± tolerance (absolute or %) | Output Voltage: 24 V ±5% |
| `boolean` | True/false flag | RoHS Compliant: Yes |
| `enum` | Single select from defined options | IP Rating: IP67 |
| `multi_enum` | Multi-select from defined options | Certifications: [CE, UL, CSA] |
| `table` | Rows of condition→value pairs (performance curves) | Speed-Torque Curve |
| `reference` | Points to another component entity | Compatible Connector: Molex 430450200 |

### 4.2 Scalar

Single numeric value with a required unit.

```typescript
interface ScalarValue {
  value: number
  unit_id: string
}
```

Switching the display unit in the editor converts the value automatically. The stored value is always in the native unit.

### 4.3 Range

Min and max values sharing a single unit.

```typescript
interface RangeValue {
  min: number
  max: number
  unit_id: string
}
```

Rendered as "−20 to +85 °C." A computed span annotation ("span: 105 °C") is shown in the editor.

### 4.4 Toleranced

Nominal value with an absolute or percentage tolerance.

```typescript
interface TolerancedValue {
  nominal: number
  tolerance: number
  tolerance_type: 'absolute' | 'percentage'
  unit_id: string
}
```

Live preview shown during editing: "24 V ±5% → 22.8 V – 25.2 V."

### 4.5 Boolean

```typescript
interface BooleanValue {
  value: boolean
}
```

Rendered as a toggle in the editor; displayed as "Yes / No" in documents.

### 4.6 Enum and Multi-Enum

```typescript
interface EnumValue {
  selected: string
  options: string[]     // defined at field creation; shared across all products
}

interface MultiEnumValue {
  selected: string[]
  options: string[]
}
```

Options are defined when the field is created. They belong to the field and are consistent across all products using that component — "IP Rating" always offers the same option set wherever it appears.

### 4.7 Table

The most complex and most strategically important field type. It models performance curves, derating tables, and multi-condition data sets — the core of hardware technical documentation.

```typescript
interface TableValue {
  columns: {
    id: string
    name: string
    unit_id: string           // required — every column must have a unit
    role: 'independent'       // X axis (1 or 2 per table)
          | 'dependent'       // Y axis — the measured or rated value
          | 'series'          // groups rows into named series (e.g. "25°C", "85°C")
  }[]
  rows: {
    id: string
    values: Record<string, number | null>   // columnId → numeric value
  }[]
  interpolation: 'linear' | 'spline' | 'step' | 'none'
}
```

**Supported data shapes:**

- **2D curve** — 1 independent, 1 dependent: speed → torque
- **Multi-series 2D** — 1 independent, 1 dependent, 1 series: speed → torque at 25°C, 50°C, 85°C
- **2D surface** — 2 independent, 1 dependent: speed × torque → efficiency. The data model supports this shape; the heatmap renderer is deferred. Engineers can enter 2D surface data now and it stores correctly — it renders as a raw data table until the heatmap renderer is built.

**Table fields are the data source for Chart blocks in the document editor.** A Chart block linked to a table field renders as an interactive chart on the portal and degrades to a static image in PDF. Charts stay in sync with the table field automatically — there is no separate "chart data entry" concept. The spec database is the single source of truth for all product data, including performance curves.

The `interpolation` field is used both for chart rendering (smooth curves vs. step functions vs. scatter points) and as context injected into AI generation prompts, enabling the AI to describe curve shape accurately rather than just enumerating data points.

### 4.8 Reference

Points to another component entity in the workspace's Component Library.

```typescript
interface ReferenceValue {
  component_id: string
}
```

**Navigation behaviour:** Clicking a reference field in the spec database editor opens the referenced component in a side panel, keeping the engineer in the context of the component they were editing. It does not navigate away or open a modal.

**AI generation behaviour:** The AI generator injects the referenced component's name only — not its full spec context. This prevents prompt bloat and avoids ambiguity about which product's specs should be the primary generation source. The AI can write "compatible with [Molex 430450200 connector]" from a name alone.

**Circular reference detection:** Circular references (Component A references Component B which references A) are detected at save time via a graph traversal and blocked with a clear error before the value is committed.

### 4.9 Conditions and Source Metadata

Two metadata attributes apply across all numeric and table field types:

**`conditions`** captures the measurement context as a freetext annotation: "at 25°C ambient, 50% load, nominal input voltage." This annotation is as important as the value itself — "Efficiency: 93%" is ambiguous; "Efficiency: 93% at 50% load, 25°C ambient" is a spec. Conditions are prominently surfaced in the editor and injected into AI generation prompts.

**`source`** distinguishes the epistemic status of the value: `rated` (the manufacturer's contractual guarantee), `typical` (characterised but not guaranteed), `measured` (from actual test data), `calculated` (derived from other fields). This distinction is significant in regulated documentation workflows — CE, UL, and ISO standards often require explicit differentiation between rated and measured values.

---

## 5. Frontend Design

### 5.1 Mental Model: Figma's Component/Instance Pattern

The UX mental model for shared components is Figma's component/instance system — a pattern familiar to technical users across engineering disciplines:

| Figma | Arther Spec Database |
|---|---|
| Component library | Component Library |
| Component master | Component entity with spec fields |
| Instance placed in a frame | Component referenced by a product |
| Local override on an instance | Scalar override on a product-component relationship |
| Editing the master propagates to all instances | Editing a component affects all products that reference it |

This framing sets accurate expectations about the shared component model without requiring explanation.

### 5.2 Navigation: Three Entry Points

The left sidebar exposes three distinct views of the same underlying data:

```
▼ PRODUCTS
  ├─ Industrial Servo A
  ├─ Conveyor Drive B
  └─ Next-gen Servo C

▼ COMPONENT LIBRARY                        [+ New]
  ├─ Motor Controller v2.1   [3 products]
  ├─ Encoder Module v1.4     [2 products]
  └─ Power Stage v3.0        [1 product]

▼ RELEASES
  ├─ Industrial Servo A — v2.1-release
  └─ Conveyor Drive B — v1.0-release
```

**Products** is the document author's entry point. Browsing a product renders its component graph as a navigable tree from that product's perspective. Shared components appear with a badge indicating they exist in multiple products.

**Component Library** is the engineer's entry point. Every component appears exactly once, with a badge showing how many products reference it. This is the canonical place to create and manage shared components.

**Releases** is the documentation manager's entry point. Lists named spec snapshots, when they were created, and which documents are based on each.

### 5.3 Three-Panel Layout

```
┌──────────────┬──────────────────────────────┬─────────────────────┐
│   SIDEBAR    │   COMPONENT / FIELD LIST     │   FIELD DETAIL      │
│              │                              │   PANEL             │
│  Products    │  Motor Controller v2.1       │                     │
│  ▼ Servo A   │  ─────────────────────────  │  Speed-Torque Curve │
│    ├─ MCU    │  ▼ ELECTRICAL                │  ─────────────────  │
│    ├─ PSU    │    Rated Voltage   36V  [!]  │  [table editor]     │
│    └─ ENC    │    Input Range  18–54V       │                     │
│              │    Rated Current  8.5A       │  Version history ▼  │
│  Component   │  ▼ PERFORMANCE               │  Apr 30 — You       │
│  Library     │    Speed-Torque [table] →    │  Added 85°C series  │
│              │    Max Speed   6000 RPM      │                     │
│  Releases    │    Efficiency  [table]  →    │  Mar 15 — James     │
│              │                              │  6200 → 6000 RPM    │
└──────────────┴──────────────────────────────┴─────────────────────┘
```

The `[!]` badge on a field indicates that one or more documents referencing this field are now stale — the engineer sees document impact without leaving the spec database.

Table fields display `→` indicating "click to expand to full-width table editor" — the table editor takes over the centre panel when focused.

The right panel shows the selected field's editing surface and its version history inline. Version history is not a separate page — it is always visible in context next to the field being edited.

### 5.4 Shared Component Affordances

When a component is used by more than one product, two persistent affordances communicate this throughout the editing experience:

**Shared banner** — visible at the top of any component accessed through a product tree:

```
⬡ Shared component — used in 3 products
Edits here affect all products. To set a product-specific value, use Override.
```

**Per-field dual actions** — every scalar field shows both Edit (global) and Override (product-specific):

```
Rated Voltage    36 V         [Edit]  [Override]
Input Range      18–54 V DC   [Edit]  [Override]
Speed-Torque     [table]      [Edit]  [—]          ← table: no override
```

When a product-specific override is active on a field:

```
Rated Voltage    24 V  ← (global: 36 V)    [Edit Override]  [Remove Override]
```

Clicking the shared banner opens a panel listing all products that reference this component, each linking directly to that product's context for the component.

### 5.5 Field Type Editing UIs

**Scalar:** Numeric input + searchable unit selector grouped by dimension (Electrical, Mechanical, Thermal…). Switching units converts the value automatically.

**Range:** Two numeric inputs (min, max) sharing one unit selector. Computed span annotation below: "span: 105 °C."

**Toleranced:** Nominal input + mode toggle (±% or ±absolute) + tolerance value. Live computed preview: "24 V ±5% → 22.8 V – 25.2 V."

**Enum / Multi-enum:** Searchable dropdown for single-select; tag-style multi-select for multi-select. Options are defined when the field is created and shared across all instances.

**Boolean:** Toggle switch.

**Table:** Full mini-spreadsheet editor embedded in the centre panel when the field is expanded. Three capabilities beyond a generic grid editor are required:

1. **Paste from Excel/CSV with column mapping** — hardware engineers invariably already have this data in a spreadsheet; import friction here is a primary adoption barrier
2. **Add/remove series** — promotes a row grouping into a named series column without restructuring the column schema
3. **Preview chart** — renders the current table data using the same chart renderer as the document editor's Chart blocks; the engineer sees immediately how the data will appear in a published document

**Reference:** Search-and-select input over the Component Library. Renders as a navigable link to the referenced component; clicking opens the referenced component in a side panel.

**Display order:** Fields are ordered within their category group by drag-to-reorder. Order is per-component — reordering fields in a live component does not affect the template it was created from. Templates set the initial display order when a product is created from them; after that, order is the component's own to manage.

### 5.6 Category Management

Field categories are selected from a **workspace-defined list** — not free-form strings. This ensures consistency across components, which is necessary for domain ownership routing in Staleness Tracking to function correctly.

**Built-in categories** — pre-loaded in every workspace, not deletable (only hideable):
Electrical, Mechanical, Performance, Thermal, Environmental, Compliance, General

**Custom categories** — workspace admins can add custom categories via Workspace Settings → Spec Categories. Custom categories can be renamed and deleted. Deletion is blocked if any fields are currently tagged with that category — the user must reassign those fields before the category can be removed.

**Inline creation** — when creating or editing a field, a user may type a category name that doesn't exist yet. They are offered "Create new category: [name]" which adds it to the workspace list on confirmation. This avoids requiring engineers to visit Settings for a quick addition.

Categories are workspace-level — all components in a workspace draw from the same category list. Category assignments are per-field: each `SpecField` carries its own `category` value selected from the workspace list.

---

## 6. Onboarding and Import

### 6.1 First-Use Entry Points

When a user creates their first product, they are presented with two paths:

```
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  📄  Import from Excel      │   │  🗂  Start from a template   │
│                             │   │                             │
│  You have a spec sheet.     │   │  Start with a pre-built     │
│  We'll structure it         │   │  spec structure for your    │
│  automatically.             │   │  product category.          │
│                             │   │                             │
│  [Upload file]              │   │  Motor / Drive              │
│                             │   │  Power Supply               │
│                             │   │  Embedded Controller        │
│                             │   │  Sensor / Transducer        │
└─────────────────────────────┘   └─────────────────────────────┘
```

The paths converge after creation. An imported product is matched against the closest template; the user is offered the chance to add any standard template fields not found in the import. A template-started product shows empty fields with per-field guidance text until values are entered.

### 6.2 AI-Powered Import

Importing from Excel is not a column-mapping problem — it is a structural interpretation problem. Hardware spec sheets don't follow a consistent schema. Rows 1–40 might be a parameter list; rows 45–80 might be a performance curve table. Two columns named "Input Voltage Min" and "Input Voltage Max" should become a single range field. A cell value of "36 V ±5%" should become a toleranced field with an extracted unit. Claude handles this structural interpretation step.

**Step 1 — Upload.** The user drops an Excel workbook or CSV. No configuration or column pre-selection is required.

**Step 2 — Claude proposes a complete structural mapping.** The proposal covers:
- Which sheets correspond to which components or assemblies
- Which row blocks are parameter lists vs. performance curve tables
- Field type inference: range detection from split min/max columns, toleranced detection from "value ±tolerance" patterns, table detection from numeric row blocks with shared column headers
- Unit extraction and normalisation: "rev/min", "RPM", and "r/min" all resolve to the RPM unit in the registry
- Category assignment using the workspace's built-in category list
- Hierarchy construction from BOM-style sheets with assembly/component columns

**Step 3 — Dedicated mapping review screen.** The import always presents a dedicated review screen — not inline editing on the upload screen. The review screen separates into two explicit steps: structural review (which sheets map to which components, which row blocks are tables vs. parameter lists) and field-level review (types, units, category assignments). This separation is important: mixing structural and field-level decisions on one screen creates cognitive overload for any import larger than ~10 fields. Users can accept, correct, or skip any element at each step. Claude's structural interpretation and its unit mapping are independently correctable.

**Step 4 — Validation pass.** Before committing, the user sees a summary of warnings: fields with unrecognised units (flagged, imported as text); cells with units embedded in the value string (value extracted, unit mapped); rows that appear to be notes rather than specs (excluded); duplicate field names (resolved with disambiguation).

**Step 5 — Commit as a named release.** The import creates a product release automatically: "Imported from MotorSpec\_v2.1.xlsx — May 2026." This is the initial entry in the product's release history.

**Import scope:** One product per import session. Batch import of multiple products from a single multi-sheet workbook is not supported at launch. This scope can be expanded once single-product import is validated with real usage.

### 6.3 Templates

Templates define the expected spec structure for a product category — the right components, field names, types, units, and required flags — without values. They are a scaffold, not a data source.

**Built-in templates at launch:** Motor/Drive, Power Supply, Embedded Controller, Sensor/Transducer. Field definitions within each template are treated as v1 drafts and validated with the first 3–5 customers per category before being marked canonical.

**Built-in templates** are **forkable but not directly editable**. A user who customises one receives a workspace copy; the original stays canonical so Arther can push improvements to built-in templates without affecting workspace customisations.

**Workspace templates** are created and owned by the workspace. Fully editable, renameable, and deletable.

```typescript
interface SpecTemplate {
  id: string
  name: string
  category: string
  built_in: boolean
  workspace_id?: string         // null for built-in templates
  components: {
    name: string
    type: string
    fields: {
      name: string
      type: FieldType
      unit_id?: string
      category: string          // uses built-in category names by default
      required: boolean
      description?: string      // guidance text: "enter continuous rated current at 25°C"
    }[]
  }[]
}
```

### 6.4 Re-import and the SpecReconciler

Hardware companies update their spec sheets continuously. Re-import is not a one-off migration — it is a recurring workflow and must be safe, non-destructive, and diff-first.

The core abstraction is the **SpecReconciler** — a shared service that accepts a normalised incoming spec payload and reconciles it against the current database state, producing a structured diff before applying any changes:

```
Excel file  →  Claude  →  normalised payload  ─┐
                                                ├─→  SpecReconciler  →  diff  →  confirm  →  apply
ERP/PLM webhook  →  schema validation  ─────────┘
```

Before committing, the user sees:

```
Re-import: MotorSpec_v2.2.xlsx

  ✓ 58 fields unchanged
  ~ 4 fields changed
  + 2 fields added
  - 1 field no longer in sheet (flagged for review — not deleted)

  This update will affect 3 documents with stale content alerts.
  [Preview changes]  [Import]  [Cancel]
```

The reconciler is **additive by default** — fields absent from the incoming payload are flagged, not deleted. Both file import and webhook sync are wrappers around the same SpecReconciler. They differ only in how the incoming payload is normalised before reaching the reconciler: Claude interprets the file; the webhook endpoint validates against Arther's published JSON schema.

### 6.5 Export

The spec database supports exporting a product's resolved spec sheet to CSV and Excel. Export is the counterpart to import and is available from the product page.

**What "resolved" means:** The exported values are the product's actual values — product-specific scalar overrides are applied, so the export reflects what the product uses, not the component global defaults. This matches the engineer's expectation: "give me this product's spec sheet."

**`internal_only` fields are excluded** from all exports. The export is consumer-facing data — the same content that would appear in a portal or PDF.

**Export format:** Excel (.xlsx) by default, with CSV as an optional format. Filename convention: `ProductName_SpecSheet_YYYY-MM-DD.xlsx`.

**Export scope:** Per-product. Export is triggered from the product page, not from the Component Library. Engineers who need raw component data can access it in the editor; the export surface is designed for the "share a spec sheet externally" workflow.

### 6.6 Null Field State

Fields on a newly created product (from a template or an import with missing values) have a `null` value. `null` means "not yet entered." There is no distinct "intentionally blank" state — if a field is not relevant to a component, it should either be removed from the component or marked `internal_only: true`.

**AI generator behaviour for null fields:**
- `null` value on a `required: true` field → placeholder block generated; the section is incomplete and flagged
- `null` value on a `required: false` field → field is silently skipped; the generator does not mention the field in generated content

**UI representation:** Null fields show a muted empty state in the editor with the field's `description` guidance text (if set on the template). Required null fields show an asterisk and a prompt to fill in the value. The field is present and named — it simply has no value yet.

### 6.7 Spec Field Comments

#### Purpose and Distinction

Spec field comments serve a fundamentally different purpose from document block comments. Document block comments are presentation feedback tied to a review cycle — they are expected to be resolved and discarded when the revision is complete. Spec field comments are **data accuracy annotations** — they are the narrative layer that explains why a spec field value is what it is, and they accumulate over the life of the product.

A spec field comment might read: *"The 47 Ω value was flagged by the EMC engineer as inconsistent with test results — see board-level test report v2.3. Updated to 52 Ω after hardware revision B sign-off."* That commentary is as important as the value itself for anyone reviewing the field's history months later, or for a regulatory submission that needs to demonstrate spec changes were deliberate and reviewed.

#### Comment and Version History View

The spec field detail view — the panel that shows a field's current value, version history, and metadata — surfaces spec field comments and version history entries in a **unified chronological feed**. The feed interleaves value changes with comment activity so the full narrative of a field's evolution is readable in one view.

Each comment in the feed is rendered with an inline context badge showing the field value at the time the comment was written: *"at this comment: 47 Ω."* This makes it immediately clear whether a comment was written about the current value or about a previous value, without requiring the reader to cross-reference the version history separately.

The unified feed is read-only from the version history perspective — field values cannot be edited from this view. Comments can be added from this view.

#### Visibility

Spec field comments are visible to any workspace member who has access to the product containing the component. Comment visibility inherits product-level access controls — if a product is access-controlled (a Feature 10: Enterprise capability), its spec field comments are visible only to members with product access. At launch, before product-level access controls exist, spec field comments on any field are visible to all workspace members.

Spec field comments are an internal surface. They are never visible on the portal, in exported PDFs, in DOCX exports, or to any external party.

#### Resolution Model

Spec field comments do not have a resolution state. They are permanent annotations — they cannot be resolved, closed, archived, or deleted by normal users. This distinguishes them clearly from document block comments, which are expected to be resolved as part of the review cycle.

The only removal action is **deletion**, available to workspace admins only, for cases where a comment was added in error or contains sensitive information that must be removed. Deletion is logged in the audit trail.

#### Notification Integration

Spec field comments integrate into the unified notification system specified in Feature 6 (Collaboration & Review, Section 9.1). The notification events generated by spec field comment activity are:

| Event | Recipients |
|---|---|
| Comment added to a spec field | The workspace member designated as the field's domain owner (driven by the field's `category` and workspace category ownership config); any workspace member who has previously commented on the field |
| @mention in a spec field comment | Mentioned person |
| Field value updated following a comment flagging it | The workspace member who wrote the comment flagging the value — closes the feedback loop |

The third event — notifying the commenter when a value they flagged is subsequently updated — is a lightweight feedback loop that requires no formal resolution action. It gives the person who raised a concern confirmation that it was addressed, without adding ceremony to the spec editing workflow.

---

## 7. Design Decisions

| Decision | Rationale |
|---|---|
| Graph model, not tree | Components are shared across products in real hardware product families. A tree forces duplication or misrepresents the data. The product tree view is computed from the graph at render time — the storage model is always a graph. |
| Eight field types including table | Hardware specs cannot be adequately represented with text, number, and enum alone. Ranges, tolerances, and performance curves are fundamental data types — not edge cases requiring workarounds. |
| Unit registry with `unit_id` references, never freetext | Enables reliable metric/imperial conversion, prevents entering a value in the wrong dimension, and ensures consistent AI prompt injection. Freetext unit strings are ambiguous and cannot be computationally mapped. |
| Store value + `unit_id` in native unit, not SI | Engineers think and work in native units. Converting to SI at storage would make the database alien to its users. Conversion is a display concern applied at render and export. |
| Calculated fields: schema now, execution engine later | Storing `source: 'calculated'`, `formula` as text, and `depends_on` field IDs today future-proofs the schema. When the computation engine is built, no migration is required. Meanwhile, the formula serves as documentation. |
| Field version history and product releases as separate mechanisms | They serve different purposes. Field history is a fine-grained audit trail for staleness detection. Product releases are high-level named snapshots for generation context and portal versioning. Conflating them would compromise both. |
| Block-to-field references store `field_version_id` | Staleness detection is a single join query — O(n) on blocks, no content scanning, no fuzzy matching. Fast, precise, and correct at any scale. |
| Chart block is a view over a table field | The spec database is the single source of truth. Charts must reflect spec data directly rather than duplicating it into a separate data entry surface. A Chart block linked to a table field auto-populates and stays in sync automatically. |
| Built-in templates are forkable, not directly editable | Users get a workspace copy to customise. Arther retains the ability to improve canonical templates without affecting workspaces that have already adopted them. |
| SpecReconciler is shared between file import and webhook sync | The reconciliation logic is identical regardless of source — incoming payload vs. current database state. A single well-tested service is more reliable than two parallel implementations diverging over time. |
| Archive over hard delete as the default for referenced entities | Permanent deletion of entities with active references destroys the audit trail and breaks referential integrity. Archive preserves all data, enables restoration, and keeps document history coherent. Hard delete is only permitted when there are zero references — making accidental destruction structurally impossible. |
| Orphaned token state rather than token deletion on archive | Silently deleting tokens when a component is archived produces broken prose delivered to reviewers with no context. The orphaned state preserves the last known value as context for the reviewer, who decides to convert to static text, remove, or re-link. Restoration from accidental archive is also clean — the cascade automatically restores orphaned tokens to current or stale. |
| Archive cascade is immediate | Deferred cascade processing would leave a window where portal-published documents appear current but their working copies contain orphaned content. Immediate cascade ensures `needs_review` flags surface before any user can publish affected documents. |
| `required` enforces a generation gate, not a publication gate | A publication gate on required fields would block time-sensitive document releases because of missing data that may be genuinely unavailable. The generation gate — producing a placeholder block when a required field is null — surfaces the gap visibly and lets the document owner decide. |
| Component hardware revisions are separate entities | "Motor Controller v2.1" and "Motor Controller v2.2" are different parts with independent version histories. Products may continue referencing v2.1 while new designs use v2.2 simultaneously. Modelling revisions as versions of one entity would conflate independent lifecycles and break the ability to track which hardware version a product actually uses. |
| Type change blocked when active scalar overrides exist | Silently clearing overrides on a type change destroys product-specific configuration without the affected product owners knowing. Blocking the type change forces intentional handling — the user removes overrides explicitly before proceeding. |
| Import review is a dedicated screen, not inline | Structural review (which sheets map to which components) and field-level review (types, units, categories) are distinct cognitive tasks. Mixing them on one screen creates overload for any import larger than ~10 fields. Two explicit steps on a dedicated screen reduce error rates on first import. |
| Single product per import session | Batch multi-product import compounds complexity significantly at the most critical moment in the customer journey. Single-product import covers the overwhelming majority of use cases and can be extended once validated. |
| Workspace-defined category list, not free-form | Inconsistent category strings break domain ownership routing in Staleness Tracking. A controlled list with built-in defaults and inline creation for new categories gives flexibility without sacrificing consistency. |
| Null means "not yet entered"; no intentionally blank state | A separate intentionally-blank state adds UI and data model complexity without clear payoff. Fields that aren't relevant to a component should be removed or marked `internal_only`, not left blank intentionally. |
| Export resolves overrides and excludes `internal_only` fields | The export is a customer-facing spec sheet. It should reflect the product's actual values (with overrides applied) and exclude fields that are explicitly marked as not for external consumption. |
| Deferred heatmap renderer for 2D surface table fields | The data model supports 2D surfaces today. The only deferred work is the heatmap chart renderer. Engineers can enter efficiency map data immediately; it stores correctly and renders as a raw data table until the renderer is added. |
| Reference field opens a side panel, not full navigation | Navigating away from the current component to inspect a referenced component loses editing context. A side panel preserves context while making the referenced component's specs inspectable. |
| Reference field injects component name only into AI prompts | Injecting the full spec context of a referenced component would bloat the generation prompt and introduce ambiguity about which product is the primary generation subject. The component name is sufficient for the AI to write accurate relationship descriptions. |
| Restoration cascade is automatic | Requiring manual confirmation per orphaned token after restoration punishes users who are correctly using the restore function. Automatic re-evaluation to current or stale is clean, correct, and consistent with the archive cascade that created the orphaned state. |
| Provenance fields present in schema at v1, populated post-launch | The External Sync adapter (Feature 8) is deferred post-launch, but adding `provenance`, `sync_source_id`, and `last_synced_at` to `SpecField` now avoids a migration later. These fields default to `'manual'` / null for all v1 data. The cost of carrying three null columns is negligible; the cost of a migration on a live production database — which may have millions of field version records — is not. |
| `BlockSpecReference.variant_id` present for variant-aware staleness | Product variant documents (Feature 9) generate their own blocks with references to the same spec fields as the base document, but with variant-specific overrides applied. Tagging references with `variant_id` allows staleness queries to target only the affected variant rather than flagging all documents that reference the field. |
| Spec field comments are field-attached with version context markers, not version-attached | Version-attached comments would mean each value change starts a new thread, losing the narrative continuity of why a field evolved the way it did. Field-attached comments with a value snapshot on each comment entry preserve the full history while keeping the thread coherent across value changes. |
| Spec field comments have no resolution state | Spec field comments are permanent annotations, not review feedback. Giving them a resolution state would conflate two distinct purposes — data accuracy narrative vs. review cycle feedback — and create confusion about when a spec comment should be "resolved." Comments that need to be removed are deleted by admins only, with an audit log entry. |
| Spec field comment visibility inherits product access controls | Spec field comments may contain sensitive design information (test failures, compliance gaps, engineering decisions not yet ready for distribution). Scoping them to product access rather than making them workspace-wide ensures they don't leak beyond the team working on that product when access controls are in place. |

---

*Arther — Spec Database: Feature Specification. Version 1.5, May 2026. Greenfield specification covering data model, field types, unit registry, version control, frontend design, onboarding, import, export, and spec field comments. All design decisions documented with rationale; all open questions resolved. Intended as the authoritative design reference for this feature bucket, independent of implementation sequencing or sprint planning.*
