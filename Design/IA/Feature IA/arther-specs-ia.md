# Information Architecture: Arther — Specs (Spec Database)

**Version:** 0.2
**Date:** 5 June 2026
**Status:** Page-level IA for the **Specs** mode. Extends `arther-app-shell-ia.md` (§6, Specs) and `arther-app-ia.md` (§4.2), and realizes the Spec Database spec (v1.5).
**Decisions locked this pass:** (1) a product/component page is organized with **content-area tabs — Spec Fields · Product Brief · Variants · Coverage**; (2) the **three-panel layout** (tree · field grid · Inspector) lives *inside* the Spec Fields tab; (3) the **Inspector is tabbed — Detail · History · Comments**; (4) the **variant delta editor is a full-canvas flow**; (5) **Import / Re-import is a full-canvas flow** that commits a release.

**This IA refines the source specs in three places:** (1) the Spec DB spec's "unified comment + version feed" (§6.7) is realized as **two Inspector tabs** (History, Comments) that share the value-at-comment context model, plus a combined "Activity" toggle (§12); (2) Product Brief (AI Generator §5.7), Variants (Variants spec), and Spec Coverage (Smart Spec Tracking §3.7) — described piecemeal across feature specs — are unified as **content-area tabs** on the product page; (3) the spec's non-collapsing three-panel layout becomes **pinned-by-default, collapsible** per the shell's per-mode panel rule.

---

## 1. Purpose & Scope

Specs is Arther's **source of truth** — the structured, version-controlled record of every product: its components, typed spec fields, releases, and the narrative brief that feeds generation. Everything downstream (AI generation, staleness, publishing) reads from here. This document defines how the Specs mode's regions are organized, what each holds and in what priority, how an engineer or author moves and acts, and the states, flows, and URLs.

**In scope:** the three Specs views (Products · Component Library · Releases); the product/component page and its content-area tabs; the Spec Fields three-panel surface and its tabbed Inspector; the eight field-type editors and the full-width table editor; shared-component override affordances; the Product Brief, Variants, and Coverage tabs; the variant delta editor and import flows (full-canvas); domain ownership; states, flows, naming, component reuse, growth, and URLs.

**Out of scope (referenced at the boundary):** the spec data model, field-type schemas, and reconciliation internals (Spec Database spec); the variant delta/merge model internals (Product Variants spec); the staleness propagation engine (Smart Spec Tracking spec); External Sync configuration (Settings → Integrations, deferred); the public portal; and all visual / design-system work.

---

## 2. Where Specs Sits (shell recap)

Specs is a top-level mode opened as universal tabs (a product, a component, or a release each open as a tab). From the shell: the **top bar** persists; the **local rail** holds the Specs views (Products · Component Library · Releases); the **Navigator (left)** is the product/component **tree or list**; the **content area** is the **field grid** (or the active tab's surface) plus a **contextual toolbar**; the **Inspector (right)** is the selected field's **Detail / History / Comments**.

The two governing shell principles hold: **left organizes** (the tree/list), **right modifies** (the field Inspector). Specs adds two ideas of its own: the product page has **content-area tabs** (Spec Fields / Product Brief / Variants / Coverage) in its contextual toolbar, and the **selected field** is the single source of "what the Inspector is about." Per the shell's per-mode rule, the Navigator and Inspector are **pinned open by default, collapsible on demand**.

---

## 3. Surface & View Map

The page-IA analog of a sitemap — the Specs views, surfaces, and key states, each with its URL.

- **Products** (rail view) `/specs` *(default)* — product list in the Navigator
  - **Product page** `/specs/product/{id}`
    - **Spec Fields** tab (default) `/specs/product/{id}` *(`?tab=fields`)*
      - Field selected → Inspector **Detail** `…?field={fieldId}` *(default panel)*
      - Inspector **History** `…?field={fieldId}&panel=history`
      - Inspector **Comments** `…?field={fieldId}&panel=comments`
      - Table field → **full-width table editor** (takes over the content area) `…?field={fieldId}&edit=table`
      - Reference field → **referenced-component side panel** (does not navigate away)
      - Shared-component banner; per-field **Edit / Override**
      - `[!]` downstream-impact badge; **pre-commit impact** summary on save
    - **Product Brief** tab `…?tab=brief` — fragment-key list → expanded fragment editor (+ referenced-by, guidance)
    - **Variants** tab `…?tab=variants` — variant list → **Add variant** → **Variant delta editor (full-canvas)** `/specs/product/{id}/variant/{variantId}/edit`; **Comparison view** (internal, full-canvas, read-only) `…/variants/compare?a={v}&b={v}`
    - **Coverage** tab `…?tab=coverage` — referenced vs. available-but-unused fields
    - **Domain Ownership** panel (per-product owner overrides) — `…?panel=ownership`
    - **Create Release** dialog `…?dialog=release` · **Export** (xlsx/csv) action
- **Component Library** (rail view) `/specs/components` — component list (each once, with embed count)
  - **Component page** `/specs/component/{id}` — tabs: **Spec Fields · Product Brief** (no Variants/Coverage — those are product-level); shared-component banner + "used in N products"
- **Releases** (rail view) `/specs/releases` — named snapshot list
  - **Release page** `/specs/release/{id}` — read-only resolved snapshot; documents generated from it; **Compare** to another release
- **[flow] Import / Re-import** (full-canvas) — upload → structural review → field-level review → validation → **commit as a release**
- **Empty (first-run)** — no products yet → **Import from Excel** / **Start from a template** entry cards
- **Loading** — chrome first; tree / grid / inspector skeletons

---

## 4. Navigation Model (within Specs)

- **Primary (mode-level):** the **local rail** switches the three views — **Products** (the document author's entry), **Component Library** (the engineer's entry, every component once), **Releases** (the documentation manager's entry). Plus a fourth, cross-cutting entry: **"go to field"** from an inline spec token in the Editor deep-links straight to a field here.
- **Secondary (per-object):** the **content-area tabs** (Spec Fields / Product Brief / Variants / Coverage) switch what a product page shows; the **Inspector tabs** (Detail / History / Comments) switch what the selected field shows. Per the shell, object sub-views live in the contextual toolbar / Inspector, not the rail.
- **In-surface:** the **Navigator** (left) is the product's component **tree** (Products view) or the flat **component list** (Component Library); clicking a component focuses its fields in the grid. A shared component carries a badge ("used in N products").
- **Utility:** inherited from the shell top bar — tabs, ⌘K search/command, notifications, Help (Ask Arther), account.
- **Keyboard (provisional):** `⌘\` toggle Navigator · `⌘⇧\` toggle Inspector · type-ahead in the field grid · ⌘F field search.
- **Mobile:** not a target (authoring is desktop-only). The public portal is the mobile-facing surface and is a separate IA.

---

## 5. Region Content Hierarchy

### Contextual toolbar (top of the content area)
1. **Product (or component) name + status + release context** — identity; which entity and whether viewing "latest" or a named release.
2. **Content-area tabs** — Spec Fields · Product Brief · Variants · Coverage (Variants/Coverage on products only).
3. **Primary actions** — **Create Release**, **Export**, **Import / Re-import**.
4. **Secondary** — Domain Ownership, archive, overflow (⋯); panel-collapse toggles at the far edges.

### Navigator (left) — pinned, collapsible
1. **The tree / list** — Products view: the product's component graph as a tree (shared components badged); Component Library: every component once with embed counts; Releases: the snapshot list.
2. **Search / filter** — the scaling mechanism as products and components grow.
3. **Add** — New product / New component / Create release, per view.
4. **Empty state** — "Add your products and components to start building your spec library."

### Content (center) — the work surface, per active tab
- **Spec Fields (default):**
  1. **The field grid, grouped by category** (Electrical, Mechanical, Performance, …) — the document of record; inline-editable.
  2. **The selected field** (drives the Inspector); the `[!]` badge marks fields whose change would make documents stale.
  3. **Shared-component banner** + per-field **Edit (global) / Override (product-specific)**; an active override shows "24 V ← (global: 36 V)".
  4. **Table fields** show a `→` to expand into the **full-width table editor** (Excel paste, add/remove series, live chart preview).
  5. **Reference fields** open the referenced component in a **side panel** (context preserved).
- **Product Brief:** fragment-key list with completeness ("needed by N docs") → expanded plain-text fragment editor with a **referenced-by** list and per-key **guidance**.
- **Variants:** the variant list (delta counts) → **Add variant** opens the **full-canvas delta editor**; entry to the internal **comparison view**.
- **Coverage:** per-document **referenced vs. available-but-unused** fields, to spot gaps.

### Inspector (right) — tabbed, pinned, collapsible
- **Detail (default):** the selected field's type-specific editor — value, **unit** (registry), **conditions** ("at 25 °C, 50 % load"), **source** (rated/typical/measured/calculated), `required` / `internal_only` flags, Edit/Override, and its **spec references** (which documents/blocks use it, with the impact `[!]`).
- **History:** the field's **immutable version feed** — every value change, by whom, when, with the structured diff (row-level for tables).
- **Comments:** **spec field comments** — data-accuracy annotations that persist across value changes, each carrying a **value-at-comment** badge ("at this comment: 47 Ω"); add / reply (one level) / @mention; no resolution state (admin-only delete). *History and Comments share the value-context model; a combined "Activity" view is available — §12.*

### Variant delta editor (full-canvas)
Base spec graph (left) · **delta list** (the four delta types: scalar override, component swap/add/remove) · **resolved preview** (right). Exits back to the product's Variants tab.

### Domain Ownership (per-product panel)
The resolved owner per spec category for this product, with the option to **override** the workspace-level category→owner mapping. The workspace defaults live in Settings → Domain Ownership.

---

## 6. User Flows

### Create the first product
1. New product → choose **Import from Excel** or **Start from a template**.
2. Import: upload → AI structural mapping → review → validation → **commit as a release** (full-canvas). Template: a scaffold of empty, guidance-annotated fields.
3. Land on the product's **Spec Fields** tab.

### Edit a field value
1. Select a field in the grid → Inspector **Detail**.
2. Edit the value (unit/conditions/source as needed); **auto-saved** as an immutable version.
3. On save, a **pre-commit impact** note shows the blast radius ("triggers review in N documents"); structured tokens auto-update, prose is flagged (Smart Spec Tracking).

### Override a shared component field
1. On a shared component (banner: "used in 3 products"), a scalar field shows **Edit** (global) and **Override** (product-specific).
2. **Override** sets a product-local value without mutating the component; shown as "24 V ← (global: 36 V)". Changing a field's **type** is blocked while overrides exist.

### Configure a table field
1. Click a table field's `→` → the **full-width table editor** takes over the content area.
2. **Paste from Excel/CSV** with column mapping; add/remove **series**; **preview chart** (same renderer as the editor's Chart block).

### Add a variant
1. **Variants** tab → **Add variant** → the **full-canvas delta editor**.
2. Define deltas (scalar override / component swap / add / remove); the **resolved preview** shows the variant's effective spec. Exit returns to the Variants tab.

### Create / use a release
1. **Create Release** from the product → name + tag → an immutable snapshot of all field versions.
2. Generation can target **latest** or a **named release**; the Releases view lists snapshots and the documents based on each.

### Re-import (recurring)
1. **Re-import** → upload → SpecReconciler produces a **diff** (unchanged / changed / added / removed-flagged) → confirm → apply. Additive by default; nothing is silently deleted.

### Resolve impact from the Specs side
1. A field's `[!]` badge → see the affected documents without leaving Specs; the staleness work itself happens on the Dashboard / Editor.

### Annotate a field
1. Inspector **Comments** → add a data-accuracy note (@mention the domain owner); it persists with its value-at-comment context.

---

## 7. States

Default (Spec Fields) · Field selected · **Table editor** (full-width) · **Shared / override** · **Orphaned** (source archived — token states resolved in the Editor) · **Stale `[!]`** · **Pre-commit impact** · **Variant delta editor** (full-canvas) · **Comparison** (read-only) · **Import / Re-import** (full-canvas) · **Release / Create-release** · **Empty** (first-run) · **Loading**.

---

## 8. Naming Conventions

| Concept | Label in UI | Notes |
|---|---|---|
| Top-level entity | **Product** | The thing the company sells |
| Shared, reusable unit | **Component** | Figma component/instance model; lives in the Component Library |
| Typed attribute | **Field** | Eight types (scalar/range/toleranced/boolean/enum/multi-enum/table/reference) |
| Product-local value | **Override** | Not "instance value"; "Edit" = global, "Override" = product-specific |
| Named snapshot | **Release** | Reused in the Editor (History) and Portal |
| Display group | **Category** | Workspace-defined list; drives grouping + domain ownership |
| Measurement unit | **Unit** | From the registry; never freetext |
| Narrative input | **Product Brief** | Plain-text fragments; a content-area tab |
| Owner of a category | **Domain owner** | Per category, per product |
| Out-of-date / archived-source | **Stale** `[!]` · **Orphaned** | Distinct states |

---

## 9. Component Reuse Map

| Component | Source | Use in Specs |
|---|---|---|
| Top bar · Local rail · Navigator shell · Inspector shell · Contextual toolbar | App-shell components | The frame; Navigator hosts the tree/list, Inspector hosts the tabs |
| Tab | DS atom | Content-area tabs + Inspector tabs |
| Field row · Section subhead · Status pill · Spec token · Avatar · Skeleton | DS atoms/molecules | Field grid rows, category headers, source/status pills, comment authors, loading |
| **Field-type editors** (per type) | New (Specs) | Scalar/range/toleranced/boolean/enum/multi-enum/table/reference editors in the Inspector Detail |
| **Table editor** | New | Full-width spreadsheet (Excel paste, series, chart preview) |
| **Version feed** / **Comment thread** | New (shared w/ Editor comments where possible) | Inspector History + Comments |
| **Shared-component banner** / **Override control** | New | Shared affordances |
| **Variant delta editor** (3-panel) | New | Full-canvas variant authoring |
| **Coverage report** / **Domain-ownership panel** | New | Coverage tab + ownership panel |
| **Import review** (structural + field steps) | New | Full-canvas import flow |

---

## 10. Content Growth Plan

- **Products / components / fields** grow indefinitely → Navigator **search/filter**, **categories** for grouping, and the Component Library's single-entry-per-component model keep it tractable.
- **Field version history** accumulates → the History tab paginates; **releases** act as anchors.
- **Spec field comments** accumulate as a permanent narrative → the Comments tab threads + filters.
- **Releases** grow → list with search; compare any two.
- **Units / categories** grow → managed in Settings (Units, Spec Categories).

---

## 11. URL Strategy

- Views: `/specs` (Products, default) · `/specs/components` · `/specs/releases`.
- Product: `/specs/product/{id}` with `?tab=fields|brief|variants|coverage` (default `fields`).
- Field selection + Inspector: `?field={fieldId}&panel=detail|history|comments` (default `detail`); table edit `&edit=table`.
- Component: `/specs/component/{id}` (`?tab=fields|brief`).
- Release: `/specs/release/{id}`; compare `?compare={otherId}`.
- Variant editor (full-canvas): `/specs/product/{id}/variant/{variantId}/edit`; comparison `…/variants/compare?a=&b=`.
- Dialogs / panels: `?dialog=release`, `?panel=ownership`.
- Flows: Import / Re-import are full-canvas app states returning to the prior tab.
- Workspace prefix reserved per the shell: `/{workspaceSlug}/…` (multi-workspace, deferred).

---

## 12. Resolved Decisions

*Resolved 5 Jun 2026 (was: open questions).*

1. **Unified feed vs. tabs** — keep **History and Comments as separate tabs** (the locked decision) **plus a combined "Activity" toggle** that interleaves version changes and comments chronologically, honoring the Spec DB spec's unified-feed intent.
2. **Domain Ownership placement** — a **per-product panel** launched from the Spec Fields toolbar (`?panel=ownership`), reading the workspace defaults (Settings → Domain Ownership) with per-product overrides; **not** folded into Coverage (distinct concern).
3. **Component page tabs** — **Spec Fields + Product Brief only** (Variants and Coverage are product-level). Confirmed.
4. **Releases compare** — a **field-level diff** (changed / added / removed fields with before→after values), reusing the version-diff rendering.
5. **Navigator vs. content** — the **component tree** lives in the Navigator (graph navigation); the **field grid** for the selected component lives in content. Deep graphs scroll/collapse in the Navigator — no region conflict. Confirmed.
6. **2D-surface table heatmap** — **deferred** per the Spec DB spec; the table editor renders raw data until the heatmap renderer ships.

---

## 13. Out of Scope (this pass)

The spec data model and field-type validation internals (Spec Database spec); variant delta/merge-conflict internals (Product Variants spec); the staleness propagation engine (Smart Spec Tracking spec); External Sync configuration (Settings → Integrations, deferred); the public portal's visitor IA; responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — Specs (Spec Database) Information Architecture. Version 0.1, 5 June 2026. Page-level IA for the Specs mode: three views (Products · Component Library · Releases), the product page's content-area tabs (Spec Fields · Product Brief · Variants · Coverage), the Spec Fields three-panel surface with a tabbed Inspector (Detail · History · Comments), the full-width table editor, shared-component overrides, the full-canvas variant delta editor and import flow, and domain ownership. Extends `arther-app-shell-ia.md` and `arther-app-ia.md` §4.2; realizes the Spec Database spec v1.5. Next in the roadmap after this: the New Document flow IA and the Dashboard IA.*
