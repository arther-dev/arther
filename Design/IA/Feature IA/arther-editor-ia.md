# Information Architecture: Arther — Document Editor

**Version:** 0.2
**Date:** 4 June 2026 (rev. 5 Jun 2026)
**Status:** Page-level IA for the **Documents · Editor** surface. Extends `arther-app-shell-ia.md` (§6, Documents mode) and realizes the Visual Block Editor spec (v1.1).
**Decisions locked this pass:** Inspector is **tabbed — Properties / Comments / History**; Outline and Inspector are **pinned open by default, collapsible on demand, hidden in Focus mode**; the manual (no-AI) empty document is a **bare canvas** with a slash hint.

**This IA refines the source specs in three places:** (1) the Visual Block Editor spec's "Outline never collapses / Properties always open" becomes **pinned-by-default but collapsible** (and hidden in Focus) per the panel decision above; (2) it **resolves that spec's open question** on the comment-panel surface — comments live as an **Inspector tab**, not a separate mode or floating panel; (3) it refines the shell IA's note that all object sub-views sit in the contextual toolbar — **render modes** (Edit/Preview) stay in the toolbar, but **panel contexts** (Properties/Comments/History) live in the Inspector.

---

## 1. Purpose & Scope

The Editor is the surface where AI-generated documents become finished, publishable products. The app-shell IA placed it (a surface inside Documents mode, opened as a universal tab, with five regions); the Visual Block Editor spec defined what a block *is*. This document defines the layer between them: how the Editor's regions are organized, what each holds and in what priority, how a writer moves and acts, and the states, flows, and URLs.

**In scope:** the Editor surface — contextual toolbar, Outline, block canvas, Inspector (Properties/Comments/History), Edit/Preview, the overlay sub-surfaces (block picker, token picker, find & replace, image upload, publish), states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** block-type schemas and degradation contracts (Visual Block Editor spec); the AI generation/New-Document flow (its own flow IA); the review/approval state-machine internals and notification model (Collaboration & Review spec); responsive/mobile editing (the Editor is desktop-only); and all visual/design-system work.

---

## 2. Where the Editor Sits (shell recap)

The Editor is the **per-document surface within Documents mode**, opened as a universal tab (the active tab = the open document). From the shell: the **top bar** persists; the **local rail** holds the Documents views; the **Navigator (left)** is the document **Outline**; the **content area** is the **block canvas** plus a **contextual toolbar**; the **Inspector (right)** is the properties panel — now tabbed.

The two governing shell principles still hold: **left organizes** (the Outline), **right modifies** (the Inspector). The Editor adds two ideas of its own: the canvas has **two render modes** (Edit ⇄ Preview), and the **active block** is the single source of "what the Inspector is about."

---

## 3. Surface & View Map

The page-IA analog of a sitemap — the Editor's views and key states, each with its URL.

- **Editor — Edit mode** `/documents/{docId}/edit`
  - Block selected → Inspector **Properties** (default) `…/edit?block={blockId}`
  - Inspector **Comments** `…/edit?block={blockId}&panel=comments`
  - Inspector **History** `…/edit?panel=history` (document) · `…?block={blockId}&panel=history` (block)
  - Block picker (slash `/`) — overlay at cursor
  - Spec-token picker (`/spec`) — overlay at cursor
  - Find & replace (⌘F) — bar at top of canvas
  - Image upload — drag-drop / file picker, inline
  - Optimistic-lock banner — top of canvas
  - Focus mode — chrome-light (`…/edit?focus=1`)
- **Preview mode** `/documents/{docId}/preview/{portal|pdf|docx}`
- **Review (read-only)** `/documents/{docId}/review` — reviewer; Inspector defaults to Comments; Approve / Request changes
- **Publish dialog** — modal `…/edit?dialog=publish`
- **Empty (manual / from-scratch)** — bare canvas, no distinct URL

---

## 4. Navigation Model (within the Editor)

- **Primary (in-surface):** the **Outline** (left) — jump to any section; for long documents it is the principal navigation. Clicking a block on the canvas is the secondary "where am I / what do I act on."
- **Secondary:** the **Inspector tabs** (Properties / Comments / History) and the **Preview sub-tabs** (Portal / PDF / DOCX).
- **Contextual toolbar** (top of the content area): document title + primary product + **save state** ("Last saved 2s ago"); the **Edit ⇄ Preview** toggle; the document's **primary action** (Publish, or Request review depending on state); secondary actions (Share, page size, Focus, overflow ⋯); and the **panel collapse** toggles at the far edges.
- **Utility:** inherited from the shell top bar — tabs, ⌘K search/command, notifications, account.
- **Keyboard:** `/` block menu · `/spec` token picker · ⌘F find & replace · ⌘\ Focus · panel-toggle shortcuts · (no save shortcut — auto-save).
- **Mobile:** not a target. The Editor is **desktop-only** (per spec); a small screen shows a "switch to a larger screen to edit" state. The public **portal** is the mobile-facing surface, and it is a separate IA.

---

## 5. Region Content Hierarchy

### Contextual toolbar (top of content area)
1. **Document title + primary product + save state** — identity and trust; the writer must always know which document/product and that work is saved.
2. **Edit ⇄ Preview toggle** (Preview ▾ → Portal / PDF / DOCX) — the mode switch that changes what the canvas renders.
3. **Primary action — Publish** (or **Request review** when the document isn't yet approved) — the document's forward motion; state-dependent.
4. **Secondary actions** — Share, page size, Focus, overflow (⋯).
5. **Panel toggles** (collapse Outline / Inspector) — far left/right edges; low frequency.

### Outline (left / Navigator) — pinned, collapsible
1. **Section list** (computed from Section Header blocks) — the navigable spine; click → scroll-to + select.
2. **Staleness indicator** (amber ●) per section — the first signal that attention is needed somewhere without scrolling.
3. **Quality-standard word-count** indicator per section (turns amber over the limit) — soft, not a gate.
4. **Empty state:** "Sections appear as you add headings."

### Block canvas (center) — the 80%-of-time surface
1. **The ordered block sequence** — the document itself; a continuous vertical scroll with no page boundaries (pagination is a PDF concern).
2. **The selected block** (left accent bar) — current focus; drives the Inspector.
3. **Inline spec tokens** — chips in Edit mode (field name on hover, non-editable), plain formatted values in Preview.
4. **Block-source signals** — placeholder blocks ("Brief content needed → Go to Product Brief", block publishing); snippet blocks (non-editable, "Edit source →"); stale tokens/blocks (amber).
5. **Insertion & manipulation affordances** — slash `/` menu, drag handles (⠿), drop indicators, multi-select.

### Inspector (right) — tabbed, pinned, collapsible
- **Properties (default tab):**
  - *No block selected* → **document properties:** title, primary product, brand profile, document type, page size, release/target.
  - *Block selected* → **block properties:** type, source, **spec references** (each with version status + "go to field"), degradation config (PDF/DOCX), and type-specific controls (Spec Table columns/rows + label overrides, Hotspot pins, Chart config).
- **Comments tab:** threads anchored to the **selected block** (or a document-level list when nothing is selected); add / reply / resolve; @mention. This is the **reviewer's default tab** in Review mode.
- **History tab:** **document-level** version history (releases + change feed) when nothing is selected; **block-level** edit history when a block is selected (the block's edits within the current revision — §12).

---

## 6. User Flows

### Open & refine a generated document
1. Writer opens a document (from the Library, ⌘K, or an existing tab) → `/documents/{docId}/edit`.
2. The canvas shows the generated blocks; the Outline lists sections (any amber ● = stale).
3. The writer edits prose **around** locked spec tokens — tokens stay intact, prose is free.
4. Selecting a block opens its **Properties** (spec references, source, degradation).
5. Auto-save persists each change ("Last saved …"); no save action.

### Insert a spec token
1. In a prose block, type `/spec`.
2. The **token picker** opens (Primary product → component → field; other workspace products below).
3. Selecting a field inserts an inline **token chip** carrying the current value and version.

### Configure a Spec Table
1. Insert `/` → **Spec Table**; pick the product.
2. With the block selected, the Inspector shows **Spec Table controls** — columns, rows (add / remove / reorder), per-document **display-label** overrides, degradation.
3. Values stay live from the spec database; cell-level value overrides are not offered (change the value at the spec level).

### Resolve a stale block
1. The Outline shows amber ● on a section; clicking it scrolls the canvas to the first stale block and selects it.
2. The Inspector → **Properties** → spec references show "at generation v2 → current v3 (stale)".
3. Per Smart Spec Tracking: **structured content auto-updates** (the token's value refreshes); **prose is flagged for human review** →
   - **Accept** the refreshed value (token) — done; or
   - **Regenerate** the block (offered by the staleness alert) → **diff preview** → accept / reject.

### Preview & publish
1. Toggle **Preview ▾ → Portal** (then **PDF / DOCX** sub-tabs); tokens render as plain values, interactive blocks apply their static contracts, page boundaries appear in PDF.
2. Back in Edit, click **Publish** (enabled only when Approved) → **Publish dialog** (version, visibility) → confirm → a **frozen snapshot** goes to the portal.
   - If the document isn't approved, the primary action is **Request review** instead, which routes into the review flow.
   - If any **placeholder block** remains, publishing is blocked with a pointer to the missing brief fragment.

### Review (reviewer)
1. A reviewer opens the document in **Review (read-only)** → `/documents/{docId}/review`; the Inspector defaults to **Comments**.
2. They read the blocks and add **block-anchored comments** (@mention as needed).
3. They **Approve** or **Request changes**, which advances the document state and notifies the owner.

### Locked document (optimistic lock)
1. Opening a document another user already has open shows a banner: "Jane has this document open."
2. Choice: **Open read-only** (view the current working copy) or **Edit anyway** (accept the conflict risk).

### Start from scratch (manual)
1. Creating a blank document (no AI) opens a **bare canvas** with a "Start typing, or press `/` to add a block" hint; the Outline is empty ("Sections appear as you add headings").
2. The writer adds blocks via `/`; the Outline populates as Section Header blocks are added.

---

## 7. States

Default (Edit) · Block selected · **Empty** (bare canvas) · **Loading** (chrome first, skeleton blocks) · **Locked** (advisory banner) · **Stale alert** (amber in Outline + Inspector) · **Preview** (Portal / PDF / DOCX) · **Focus** (rail + both panels hidden, top bar kept) · **Review** (read-only, Comments default) · **Publishing** (dialog) · **Placeholder-present** (publishing blocked).

---

## 8. Naming Conventions

| Concept | Label in UI | Notes |
|---|---|---|
| Editable unit | **Block** | Everything on the canvas is a block. |
| Spec-linked value | **Spec token** (chip) | Not "variable" or "field reference" in-product. |
| Live reused content | **Snippet** | Non-editable in the canvas; "Edit source". |
| Missing-brief block | **Placeholder** | Blocks publishing; "Go to Product Brief". |
| Left panel | **Outline** | Per the spec; not "navigator" in-product. |
| Right panel | **Inspector** (internal) / **Properties · Comments · History** (tabs the user sees) | — |
| Render switch | **Edit / Preview** | Preview has Portal / PDF / DOCX. |
| Non-interactive fallback | **Static contract** | Internal term; surfaced as "Degradation" in Properties. |
| Out-of-date | **Stale** | Amber ●; "needs review". |
| Named snapshot | **Release** | Spec DB term, reused. |
| Editable instance | **Working copy** | What auto-save writes to. |

---

## 9. Component Reuse Map

| Component | Source | Use in the Editor |
|---|---|---|
| Top bar, Local rail, Navigator shell, Inspector shell, Contextual toolbar | App-shell components | The frame; Navigator hosts the Outline, Inspector hosts the tabs. |
| Tab | DS atom | Inspector tabs + Preview sub-tabs. |
| Button, Status pill, Avatar, Spec token, Skeleton, Safety block, Section subhead, Field row | DS atoms/molecules | Toolbar actions, document-state pill, comment authors, inline tokens, loading, safety blocks on canvas, Inspector groups. |
| **Block** (per type) | New (editor) | The canvas units; one component family per block type. |
| **Block controls** (drag handle, ⋯ menu, accent) | New | Selection, reorder, block actions. |
| **Slash menu** / **Token picker** | New | Block and token insertion overlays. |
| **Outline item** | New | Section row with staleness + word-count indicators. |
| **Comment thread + composer** | New | Inspector Comments tab. |
| **Spec-reference row** / **Degradation control** / **Diff preview** | New | Inspector Properties + regeneration. |
| **Lock banner** | New | Advisory optimistic-lock state. |

---

## 10. Content Growth Plan

- **Blocks/sections** grow with the document → the **Outline** is the scaling navigation; **find & replace** and jump-to-section keep long documents tractable.
- **Comments** accumulate → the Comments tab threads, resolves, and filters (open / resolved).
- **Version history** grows → the History tab paginates; releases act as anchors.
- **Token picker** scales with the number of workspace products → search-first with a recent-products filter, scoped by default to the document's primary product (no per-document allowlist at v1 — §12).

---

## 11. URL Strategy

- Base: `/documents/{docId}/edit`
- Selected block: `?block={blockId}` — deep-links to a block (selects + scrolls).
- Inspector tab: `&panel=properties|comments|history` (default `properties`).
- Preview: `/documents/{docId}/preview/{portal|pdf|docx}`.
- Review: `/documents/{docId}/review`.
- Dialogs: `?dialog=publish`.
- Focus: a UI state, optionally `&focus=1`.
- Workspace prefix reserved per the shell: `/{workspaceSlug}/…` (multi-workspace, deferred).

---

## 12. Resolved Decisions (carried from the Visual Block Editor spec)

*Resolved 5 Jun 2026 (was: open questions).*

1. **Comment anchoring on delete/regenerate** — on block **delete** or substantial restructure the comment **orphans** (preserved, anchor flagged, shown in the detached-comments section, per Collaboration §6.4); on **regenerate** it **re-anchors** to the regenerated block when the block id persists, otherwise it orphans.
2. **Undo/redo granularity** — **per discrete action** (insert / delete / reorder / property change / token insert = one step; typing is coalesced by pauses), not per keystroke.
3. **Block-level version history** — the History tab (block selected) shows the block's **edits within the current revision** — value/token changes and regenerations with author + timestamp. The full release + change-feed history is the document-level view (nothing selected).
4. **Token picker scale** — **search-first**, scoped by default to the document's **primary product** (other workspace products listed below) with a recent-products filter; no hard per-document allowlist at v1.
5. **Advisory-lock conflict** — **yes:** the losing writer is **notified**, and their overwritten changes are preserved as a **recoverable snapshot** — never silently lost.

---

## 13. Out of Scope (this pass)

Block-type schemas and degradation contracts (Visual Block Editor spec); the AI generation / New-Document flow (its own flow IA); the review/approval state-machine internals and notification architecture (Collaboration & Review spec); responsive/mobile editing (desktop-only); and visual / design-system work.
