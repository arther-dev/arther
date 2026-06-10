# Information Architecture: Arther — Import / Re-import Flow

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **Import / Re-import** full-canvas flow (Specs mode). Extends `arther-app-shell-ia.md` (full-canvas flow state), `arther-app-ia.md` (§3.4 Flow A, §4.2), and `arther-specs-ia.md` (Import = full-canvas → commits a release); realizes the Spec Database spec (v1.5 §6.1–§6.4).
**Decisions this pass (no layout fork — the spec prescribes the step sequence):** (1) Import is a **full-canvas stepper flow**; (2) **first import** = Upload → **Structural review** → **Field-level review** → **Validation** → **Commit**; (3) **re-import** = Upload → **Reconciliation diff** (SpecReconciler) → **Commit**; (4) structural and field-level review are **separate steps** (spec §6.2 — mixing them overloads imports >~10 fields); (5) the reconciler is **additive by default** (removed fields flagged, never silently deleted); (6) **Commit always creates a named release**; one product per session.

**This IA stays in its lane:** the SpecReconciler engine, field-type inference, and unit-registry internals belong to the **Spec Database spec**; this doc defines only how the import *flow* is organized on screen. Webhook/ERP sync (post-launch, External Sync) wraps the **same SpecReconciler** and reuses the **diff/commit** steps — it differs only in how the incoming payload is normalised (schema-validated, not Claude-interpreted).

---

## 1. Purpose & Scope

Import is how a hardware company's existing spec sheets become structured Arther data — safely, non-destructively, and diff-first. The first import turns an Excel/CSV into a typed, categorized product (committed as the product's first release). Re-import is the **recurring** workflow: it reconciles an updated sheet against the live database and shows exactly what changed before applying anything. Both run through one engine (the SpecReconciler) and one full-canvas flow.

**In scope:** the entry points (Import from Excel / Start from a template); **Upload**; the **Structural review** step (sheets→components, table-vs-parameter-list); the **Field-level review** step (type / unit / category); the **Validation** warnings pass; **Commit as a release**; the **re-import Reconciliation diff** (unchanged / changed / added / removed-flagged); processing and error states; how the flow returns to Specs; states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** the SpecReconciler algorithm, field-type inference, and unit normalisation internals (Spec Database spec); **template** authoring (Spec Database / Settings); webhook/ERP **External Sync** configuration (Settings → Integrations, post-launch); the staleness cascade the commit triggers (Smart Spec Tracking / Dashboard); **Export** (the counterpart, Specs); batch/multi-product import (post-launch); and all visual / design-system work.

---

## 2. Where the Flow Sits (shell recap)

Import is a **full-canvas flow** in the **Specs** mode: it opens as a tab, **takes over the content area** (rail / Navigator / Inspector hidden), keeps the **top bar**, and **commits to a release** then drops the user on the product's **Spec Fields** tab (or returns to the prior tab on Cancel). It is reached from a product's **Import / Re-import** action, from the first-run **Import from Excel** entry, and (post-launch) is the same diff/commit surface a webhook sync routes through.

The flow is a **linear stepper** with a persistent step indicator. First-import and re-import are the **same flow** with a different middle: first-import reviews *structure then fields*; re-import reviews a *reconciliation diff*.

---

## 3. Surface & Step Map

- **Entry** (first product) `/specs?new=1` — two paths: **Import from Excel** · **Start from a template** *(template path → a scaffolded product, not this flow)*
- **Import flow** (full-canvas) `/specs/import` *(`?product={id}` for re-import)*
  - **1 · Upload** `…/import` — drop an .xlsx/.csv; no pre-configuration
  - **2 · Structural review** `…/import?step=structure` — Claude's proposed sheet→component map; table vs. parameter-list; hierarchy from BOM columns; accept / correct / skip
  - **3 · Field-level review** `…/import?step=fields` — inferred **type · unit · category** per field; range/toleranced/table detection; accept / correct / skip
  - **4 · Validation** `…/import?step=validate` — warnings summary (unrecognised units → text; embedded-unit cells; note-rows excluded; duplicate names disambiguated)
  - **5 · Commit** — creates the named **release** ("Imported from MotorSpec_v2.1.xlsx") → lands on the product's Spec Fields
  - **Processing** — Claude interpreting the workbook (between Upload and Structural review)
  - **Error** — unreadable file / interpretation failure → retry (selections preserved)
- **Re-import flow** (full-canvas) `/specs/product/{id}/reimport`
  - **1 · Upload** → **2 · Reconciliation diff** `…?step=diff` (SpecReconciler: ✓ unchanged · ~ changed · + added · − removed-flagged; "affects N documents") → **3 · Commit**
- **Empty / first-run** — the Entry cards (no products yet)

---

## 4. Navigation Model (within the flow)

- **Step indicator** — a persistent stepper (Upload · Structure · Fields · Validate · Commit for first import; Upload · Review · Commit for re-import); completed steps ✓, current highlighted, future muted; back-navigable.
- **Per-step actions** — **Back** · **Continue** (advance); the primary commit action is **Import** / **Commit as release** on the last step. **Cancel** exits the flow (nothing committed).
- **Accept / correct / skip** — every proposed element (a sheet mapping, a field type, a unit) is independently correctable on its review step; nothing is forced.
- **Diff-first** — re-import never applies changes before the user confirms the diff; **removed fields are flagged, not deleted**.
- **Keyboard (provisional):** `⌘↵` advance / commit · `Esc` cancel.
- **Mobile:** not a target (desktop-only).

---

## 5. Region Content Hierarchy (per step)

The flow hides rail/Navigator/Inspector; each step fills the canvas under the top bar, with a **stepper** at the top and a **footer** (Back · Continue/Commit).

### 1 · Upload
1. Title + which product (or "New product").
2. **Dropzone** — drag an .xlsx/.csv, or browse; "no column pre-selection needed."
3. A secondary path for first-run: **Start from a template** instead.
4. Note: one product per import.

### 2 · Structural review
1. **Sheet → component map** — each sheet/assembly mapped to a component (correctable); BOM hierarchy shown as a tree.
2. **Row-block classification** — which blocks are **parameter lists** vs. **performance-curve tables** (a `→` to inspect a detected table).
3. Per-item **accept / correct / skip**; a running "N components · M field groups" summary.

### 3 · Field-level review
1. **Field table** — name · **inferred type** (scalar/range/toleranced/boolean/enum/table/reference) · **unit** (registry-mapped) · **category** — each cell correctable.
2. **Detection callouts** — split min/max → range; "36 V ±5%" → toleranced; numeric row-block → table.
3. Per-field accept / correct / skip; grouped by component/category.

### 4 · Validation
1. **Warnings summary** — unrecognised units (imported as text, flagged); embedded-unit cells (value extracted, unit mapped); note-rows excluded; duplicate names disambiguated.
2. Each warning links to the field; **advisory, not blocking** — the user can commit with warnings.
3. **Downstream note** (re-import) — "affects N documents with stale-content alerts."

### 5 · Commit
1. **Release name** (prefilled "Imported from {filename} — {month}") + tag.
2. **Commit as release** → success → product Spec Fields.

### Re-import · Reconciliation diff (replaces steps 2–4)
1. **Diff summary** — ✓ N unchanged · ~ N changed · + N added · − N removed-flagged.
2. **Diff table** — field · current → incoming · change type (colored); removed rows marked "no longer in sheet — flagged, not deleted."
3. **Downstream impact** — "affects N documents." **Preview changes** · **Import** · **Cancel**.

---

## 6. First Import vs. Re-import

| | First import | Re-import |
|---|---|---|
| Trigger | New product → Import from Excel | Product → Re-import |
| Middle steps | Structural review → Field-level review → Validation | Reconciliation diff (SpecReconciler) |
| Default posture | Build the structure from scratch | **Additive** — flag removals, never delete |
| Commit | First release | New release; **triggers staleness** review on affected docs |
| Engine | Same **SpecReconciler** (Claude normalises the file → reconciler) | Same SpecReconciler |

---

## 7. User Flows

### First import (the onboarding moment)
1. New product → **Import from Excel** → **Upload** → *Processing* (Claude interprets).
2. **Structural review** (accept/correct sheet→component, tables) → **Field-level review** (types/units/categories) → **Validation** (warnings) → **Commit** → product Spec Fields, first release created.

### Re-import (recurring)
1. Product → **Re-import** → **Upload** → **Reconciliation diff** (unchanged/changed/added/removed-flagged + "affects N docs") → **Import** → new release; affected docs flagged stale (Dashboard).

### Correct a misread
1. On Structural or Field-level review, the user **corrects** a wrong type/unit/mapping or **skips** an element; Claude's proposal is a starting point, never final.

### Recover from a failure
1. Unreadable file / interpretation error → **Error** state → **Retry** (the uploaded file + any selections preserved); no partial data committed.

---

## 8. States

Entry (two paths) · Upload · Processing (interpreting) · Structural review · Field-level review · Validation (warnings) · Commit · Re-import diff · Error (unreadable / failed) · Success (release created · returns to Spec Fields) · Loading.

---

## 9. Naming Conventions

| Concept | Label in UI | Notes |
|---|---|---|
| The flow | **Import** / **Re-import** | Full-canvas; one product per session |
| Engine | **SpecReconciler** | Internal; surfaces as the diff step |
| Structure step | **Structural review** | Sheets→components, tables vs. lists |
| Field step | **Field-level review** | Type · unit · category |
| Pre-commit check | **Validation** | Advisory warnings, non-blocking |
| Re-import change set | **Reconciliation diff** | ✓ unchanged · ~ changed · + added · − removed-flagged |
| Commit artifact | **Release** | Auto-named from the filename |
| Scaffold path | **Template** | Start-from-template (not this flow) |

---

## 10. Component Reuse Map

| Component | Source | Use in the flow |
|---|---|---|
| Top bar | App-shell | Persistent chrome |
| **Stepper** | New (shared w/ New Document Generating) | The step indicator |
| **Dropzone** | New (Import) | Upload step |
| Table row · Field row · Section subhead | DS | Structural + field-level review tables, diff table |
| Status pill · Spec token | DS | Type/unit chips, change-type markers |
| Button · Text field · Tab | DS | Footer actions, release name, correct-in-place |
| **Diff table** | Shared w/ Releases compare | Reconciliation diff (field-level) |
| Skeleton | DS | Processing / loading |

---

## 11. Content Growth Plan

- **Large workbooks** (hundreds of fields) → the separate structural/field steps + grouping keep each screen scannable; long tables paginate/scroll.
- **Re-import diffs** grow → the diff groups by change type; "show unchanged" is collapsed by default.
- **Templates** grow → the entry's template list is searchable (per the Spec DB spec's category templates).

---

## 12. URL Strategy

- First import: `/specs/import` with `?step=structure|fields|validate`; `?product={id}` when importing into an existing product.
- Re-import: `/specs/product/{id}/reimport` with `?step=diff`.
- Full-canvas flow: returns to the product's Spec Fields on commit, or the prior tab on Cancel; reserves `/{workspaceSlug}/…`.

---

## 13. Resolved Decisions (this pass)

1. **Full-canvas stepper**, not a modal — imports are multi-step and data-dense.
2. **Structural review and field-level review are separate steps** (spec §6.2).
3. **Additive re-import** — removed fields flagged, never deleted; **diff-first** (nothing applied before confirm).
4. **Commit always creates a named release** (auto-named from the file).
5. **Validation is advisory**, not a gate.
6. **One flow, two middles** — first-import (structure → fields → validate) vs. re-import (reconciliation diff); both wrap the SpecReconciler; webhook sync reuses the diff/commit steps post-launch.

*Open (resolve during build):* how deeply the **structural review** visualises a detected performance-curve table inline; whether **Validation** folds into the last review step for small imports (<~10 fields); the **template** path's own screens (Spec DB / Settings, not here).

---

## 14. Out of Scope (this pass)

The SpecReconciler algorithm + field-type inference + unit normalisation (Spec Database spec); **template** authoring; **External Sync** webhook configuration + conflict queue (Settings → Integrations, post-launch); the staleness cascade the commit fires (Smart Spec Tracking / Dashboard); **Export** (Specs); **batch / multi-product** import (post-launch); responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — Import / Re-import Flow Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the full-canvas import flow: Upload → Structural review → Field-level review → Validation → Commit (first import), and Upload → Reconciliation diff → Commit (re-import), both wrapping the SpecReconciler, additive and diff-first, committing a named release. Extends `arther-app-shell-ia.md`, `arther-app-ia.md` (§3.4 Flow A) and `arther-specs-ia.md`; realizes the Spec Database spec v1.5 §6. Next in the roadmap: Portal-management, Settings, Snippets, Cross-cutting, then the Public Portal visitor IA.*
