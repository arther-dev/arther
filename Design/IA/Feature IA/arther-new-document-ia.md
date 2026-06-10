# Information Architecture: Arther — New Document Flow (AI Generation)

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **New Document** full-canvas flow. Extends `arther-app-shell-ia.md` (full-canvas flow state) and `arther-app-ia.md` (§3.4 Flow A, §4.3, §11 Decision 5), and realizes the AI Document Generator spec (v1.2).
**Decisions this pass (single-screen layout confirmed via mockups, 6 Jun 2026):** (1) the flow is a **single full-canvas configuration screen** — Document Type · Product (+release) · Brand Profile chosen together — with a **live pre-flight completeness** panel, *not* a multi-step wizard (the old "4-step" decision is refined: "Style" split into Brand Profile + Document Quality Standard, and pre-flight replaces a separate review step); (2) **Generate** transitions to a **streaming generation** screen, then drops into the Editor; (3) the **review-and-generate** offer (Decision 5) is a sibling full-canvas screen launched from a notification or the Specs Brief tab; (4) **placeholders never block generation** — they are a feature, not an error.

**This IA refines the source spec in three places:** (1) the generator spec's §5.1 selection screen is specified here as a **two-column configure surface** (selections left, live pre-flight right); (2) the §5.2 generation experience is specified as a **dedicated streaming screen** with a live preview rail; (3) the §5.8 failure policy is mapped to **two distinct screens/states** — complete-failure (pre-generation, retRy whole) vs. partial-failure (draft with error blocks, handed to the Editor).

---

## 1. Purpose & Scope

New Document is the moment Arther's structured data becomes a draft. It is the **front door to authoring**: the technical writer picks what to generate (Document Type), what to generate it for (Product + release), and how it should read (Brand Profile), sees exactly what will and won't generate (pre-flight completeness), and commits to an atomic generation that streams into being and lands in the Editor. It is a **deterministic configuration flow**, never a prompt box or chat window.

**In scope:** the entry points to the flow; the configure surface (Document Type picker, Product/release selector, Brand Profile selector, read-only Quality Standard, live pre-flight completeness); the generation/streaming surface; the hand-off into the Editor; the **review-and-generate** offer surface (auto-generation, Decision 5); first-run/blocked states (no products, missing prerequisites); generation-failure states and retry; states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** the generation pipeline internals, block source taxonomy, and prompt construction (AI Document Generator spec); the **Product Brief editing surface** (lives in Specs — see `arther-specs-ia.md`, Brief tab); the Editor that receives the output (`arther-editor-ia.md`); Document Type / Brand Profile / Document Quality Standard **authoring** (Settings — see the Settings IA); the Import/Re-import flow (its own IA); and all visual / design-system work.

---

## 2. Where the Flow Sits (shell recap)

New Document is a **full-canvas flow** (App Shell IA): it opens as a tab, **takes over the content area** — the local rail, Navigator, and Inspector are hidden — keeps the **top bar** persistent, and **returns to the prior tab on exit** (Cancel) or **hands off to the Editor** on success. It is not a mode and has no rail view of its own; it is reached *from* Documents (and from Specs).

The flow owns three surfaces: **Configure** (pick + pre-flight), **Generating** (stream), and the sibling **Review & generate** (the auto-offer). The Editor is the destination, not part of the flow.

---

## 3. Surface & Step Map

The flow's surfaces and key states, each with its URL. Full-canvas flows are app states that return to the prior tab on exit (app-ia §12).

- **Configure** `/documents/new` *(default entry)* — the single configuration surface
  - `?type={typeId}` · `?product={productId}` · `?release={releaseId}` — deep-linkable preselection (e.g. launched from a product in Specs)
  - **Pre-flight: all complete** — every section has data → "10 of 10 will generate fully"
  - **Pre-flight: with placeholders** — some brief fragments / spec fields absent → "7 of 10 fully · 3 placeholders"; `[Add brief first]` / `[Generate now]`
  - **Blocked: no products** — workspace has no products → "Add a product first" → Specs import/new
  - **Blocked: missing prerequisites** — no Document Type and/or no Brand Profile yet (first-run) → links into Settings
- **Generating** `/documents/new/generating` *(transient)* — section-by-section streaming + live preview; cannot be edited; auto-advances to the Editor
  - **Complete failure** — generation failed before any section → error state, single **Retry** (selections preserved); no document created
- **Editor (hand-off)** `/documents/{id}/edit` — the generated draft opens here (not part of this flow)
  - **Partial failure** arrives here — a draft with **error block(s)** (red, section-level retry) interleaved with completed sections
- **Review & generate** `/documents/generate-offer?fragment={key}&entity={id}` *(sibling full-canvas)* — the **automatic generation offer** (Decision 5): affected documents + placeholder sections, opt-in per document; launched from a **notification** or the **Specs → Brief** tab

---

## 4. Navigation Model (within the flow)

- **Entry points (into Configure):** Documents → Library **"New document"** button; the top-bar tab **`+`** and **⌘K** command palette ("New document"); a **product in Specs** ("Generate document" → preselects product/release); per-mode **empty states** ("Generate your first document"). All open `/documents/new` as a full-canvas tab.
- **Within Configure:** linear top-to-bottom — Document Type → Product (+release) → Brand Profile — with the **pre-flight panel** updating live as Type and Product resolve. No step gating; any field can be changed in any order until **Generate**.
- **Forward:** **Generate now** → Generating → (auto) Editor. **Add brief first** → opens the **Specs → Brief** tab for the selected product (the configure tab persists; the writer returns to it).
- **Exit:** **Cancel** / close tab → returns to the prior tab (typically Documents → Library). Nothing is created.
- **Review & generate:** entered from a notification or the Brief tab; **per-document opt-in**; **Generate selected** runs the same pipeline and returns the user to where they were (documents update in place).
- **Keyboard:** `⌘↵` = Generate now (when valid); `Esc` = Cancel. (Provisional.)
- **Mobile:** not a target (authoring is desktop-only).

---

## 5. Region Content Hierarchy

The flow hides the rail/Navigator/Inspector; each surface fills the canvas under the top bar.

### Configure (`/documents/new`)
A **two-column** surface: selections (left, primary) · live pre-flight (right).

**Header** — "New document" title; Cancel; the primary **Generate now** action (disabled until Type + Product are set).

**Left column — selections (in order):**
1. **Document Type** — a **searchable list** of built-in + workspace types, each with a one-line description of what it produces and a **built-in/forked** indicator. Single-select. (Source of the section structure + the Quality Standard.)
2. **Product** — product selector + a **release selector** (defaults to **Latest**; named releases listed). The product determines the spec + brief data; the release pins inline tags (release-pinned docs don't auto-update — §7).
3. **Brand Profile** — workspace Brand Profiles; the **workspace default is preselected**. If the workspace has only one, this collapses to a single read-only line. (Shapes presentation, not content.)
4. **Quality Standard (read-only)** — shown as inherited from the Document Type ("Quality standard: Concise Technical — from Datasheet type"); not chosen here.

**Right column — pre-flight completeness (live, deterministic):**
1. **Per-section status list** — every Document Type section with a state: **✓ complete** (spec data present), **○ brief needed** (required brief fragment absent), **○ spec field empty** (null required field). Computed from the type's data contracts against the product's current data; **instantaneous, no generation yet**.
2. **Summary line** — "7 of 10 sections will generate fully · 3 will be placeholders."
3. **Resolution affordances** — each `○` row links to what would unlock it (the specific brief fragment in Specs, or the empty spec field). **`[Add brief first]`** (→ Specs Brief tab) sits beside **`[Generate now]`** — both valid; **no blocking gate**.

### Generating (`/documents/new/generating`)
A focused streaming surface — **status list (left) · live preview (right)**.
1. **Section status stream** — each section advances through **queued → generating (⧖) → complete (✓)**; placeholder sections are marked **placeholder** up front and never attempted; the failed section (if any) shows an inline error.
2. **Live preview** — the document assembling block-by-block as sections complete, so the writer watches it take shape.
3. **On finish** — auto-transition into the **Editor** with the draft loaded (placeholder blocks rendered distinctly, publish-blocking).
4. **Complete-failure** — if nothing generated: an error panel ("Generation failed — nothing was created"), a single **Retry** (selections preserved), and a Cancel; no draft persists.

### Review & generate (`/documents/generate-offer`)
The **automatic generation offer** (AI Generator §5.4; Decision 5) — a full-canvas opt-in screen.
1. **Context line** — what changed and why this offer exists: "`target_applications` was added to Industrial Servo A" (product), or the **component blast-radius** form: "`target_applications` added to Motor Controller v2.1, referenced by Servo A, Conveyor Drive B, Next-gen Servo C."
2. **Affected-documents list** — each document + its now-generatable placeholder section(s), with a per-document checkbox (**opt-in**; nothing auto-generates).
3. **Actions** — **Generate selected** (runs the pipeline for the chosen documents) · Dismiss. Returns the user to their prior context; documents update in place.

---

## 6. User Flows

### Generate a first draft (happy path)
1. Documents → **New document** → Configure.
2. Pick **Document Type** → pick **Product** (release defaults to Latest) → Brand Profile defaults in.
3. **Pre-flight** shows all sections complete → **Generate now**.
4. **Generating** streams section-by-section → opens in the **Editor**.

### Generate with placeholders (the common case)
1. Configure → pre-flight shows "7 of 10 · 3 placeholders" (brief not yet written).
2. The writer chooses **Generate now** (placeholders are a feature) → draft opens with distinct, publish-blocking **placeholder blocks** linking to the exact brief fragment.
   - *or* **Add brief first** → Specs → Brief tab → write the fragment → return → pre-flight re-computes → Generate.

### Add brief later → review-and-generate offer
1. A writer (or spec owner) saves a **Brief fragment** in Specs.
2. Arther finds documents with placeholders waiting on that fragment key → fires a **notification**.
3. **Review & generate** lists the affected documents → the writer **opts in per document** → **Generate selected** fills those sections.
   - **Component brief** edits surface the multi-product blast radius explicitly (component name + affected products).

### Generate for a named release (release-pinned)
1. Configure → set **release** to a named version (not Latest).
2. The generated doc's inline spec tags are **locked to that release's field versions**; later changes to Latest do **not** auto-update it and raise no staleness (consistent with Smart Spec Tracking).

### Generation failure
1. **Complete failure** (nothing generated) → error + **Retry** on the Generating screen; no draft created.
2. **Partial failure** (some sections done) → a **draft is saved** and opens in the Editor with **error block(s)** (red, distinct from placeholders); the writer **retries the failed section** only — using current spec/brief state at retry time.

### Blocked / first-run
1. **No products** → Configure shows a blocked state → "Add a product first" → Specs (Import / New product).
2. **No Document Type or Brand Profile** → Configure points to Settings to create the prerequisite (also covered by the Onboarding setup checklist on the Dashboard).

---

## 7. States

Configure · Configure (all complete) · Configure (with placeholders) · Configure (blocked — no products) · Configure (blocked — missing prerequisites) · Generating (streaming) · Generating (complete failure) · Editor hand-off (with placeholders) · Editor hand-off (partial failure / error blocks) · Review & generate (product) · Review & generate (component blast radius) · Loading.

---

## 8. Naming Conventions

| Concept | Label in UI | Notes |
|---|---|---|
| The flow | **New document** | The button, the tab, the flow; not "wizard" in UI copy |
| Generation schema | **Document Type** | Datasheet, Installation Manual, … (forkable built-ins) |
| Presentation config | **Brand Profile** | Workspace-level; not "Style Profile" |
| Output-discipline config | **Document Quality Standard** | Inherited from the Document Type; read-only here |
| Pre-generation check | **Pre-flight** | The deterministic completeness summary |
| Unfilled-but-known gap | **Placeholder** | Brief-missing or null required spec field; publish-blocking; not an error |
| Technical failure | **Error block** | Red, retryable; distinct from a placeholder |
| Pinned version | **Release** | "Latest" or a named release; release-pinned tags don't auto-update |
| Auto-offer | **Review & generate** | The opt-in screen after a brief is added (Decision 5) |

---

## 9. Component Reuse Map

| Component | Source | Use in the flow |
|---|---|---|
| Top bar | App-shell | Persistent chrome; the flow tab lives here |
| Tab · Button · Text field · Status pill | DS atoms | Type/product/brand selectors, actions, pre-flight status pills |
| **Select list / searchable picker** | New (flow) | Document Type list, Product + release selectors |
| **Pre-flight section row** | New (flow) | The per-section ✓ / ○ completeness rows + resolution links |
| **Stream status row** | New (flow) | Generating: queued / generating / complete / placeholder |
| **Live preview pane** | Reuses Editor block render (read-only) | The assembling document on the Generating screen |
| Wizard step (if stepped layout chosen) | DS molecule | Only if the stepped layout wins the §13 decision |
| Avatar · Doc card | DS | Review & generate: affected-document rows |

---

## 10. Content Growth Plan

- **Document Types / Brand Profiles** grow → the Type picker is **searchable**; the Brand selector collapses when there's one.
- **Sections per type** grow → the pre-flight list scrolls; the summary line keeps the headline legible.
- **Affected documents** in a review-and-generate offer grow (esp. component briefs) → the list paginates/groups by product.
- **Releases** grow → the release selector is a searchable dropdown defaulting to Latest.

---

## 11. URL Strategy

- Configure: `/documents/new` with `?type=`, `?product=`, `?release=` for deep-linked preselection.
- Generating: `/documents/new/generating` (transient; not a durable destination).
- Hand-off: `/documents/{id}/edit` (the Editor owns this).
- Review & generate: `/documents/generate-offer?fragment={key}&entity={id}`.
- Full-canvas flow: an app state that **returns to the prior tab** on exit; reserves the `/{workspaceSlug}/…` prefix per the shell.

---

## 12. Resolved Decisions (this pass)

1. **Single configure screen, not a 4-step wizard** *(confirmed via mockups, 6 Jun 2026)* — Document Type · Product · Brand Profile are chosen on one full-canvas surface with a live pre-flight panel. Refines the earlier "wizard / product→type→style→generate" decision: "Style" split into Brand Profile (usually one, preselected) + Document Quality Standard (inherited from the type, read-only), so a multi-step wizard would mostly show single-option steps. The spec's §5.1 single selection screen is the basis.
2. **Pre-flight is live and non-blocking** — completeness recomputes as Type/Product resolve; placeholders never gate Generate.
3. **Generating is its own screen** with a live preview, then auto-hands-off to the Editor.
4. **Review & generate is a sibling full-canvas screen** (Decision 5), opt-in per document, launched from a notification or the Specs Brief tab.
5. **Failure split** — complete-failure stays in the flow (retry whole, no draft); partial-failure becomes a draft with error blocks owned by the Editor.

*Open (resolve during build):* whether the **live preview** on the Generating screen is full-fidelity block render or a lightweight section list; the **Document Type editor** UX (Settings, not here); brief-fragment versioning depth (spec open question).

---

## 13. Out of Scope (this pass)

The generation pipeline internals and prompt construction (AI Generator spec); the **Product Brief editor** (Specs IA); **Document Type / Brand Profile / Quality Standard authoring** (Settings IA); the **Editor** that receives output (Editor IA); the **Import/Re-import** flow (its own IA); **batch generation** across multiple products (deferred per the spec); multi-language generation (deferred); responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — New Document Flow (AI Generation) Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the full-canvas generation flow: entry points, the Configure surface (Document Type · Product/release · Brand Profile + live pre-flight completeness), the streaming Generating surface, the Editor hand-off, the Review-and-generate auto-offer (Decision 5), blocked/first-run and failure states. Extends `arther-app-shell-ia.md` and `arther-app-ia.md` (§3.4 Flow A, §4.3); realizes the AI Document Generator spec v1.2. Next in the roadmap: the Dashboard IA.*
