# Information Architecture: Arther — Snippets (Content Reuse)

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **Snippets** mode — the workspace's reusable-content library. Extends `arther-app-shell-ia.md` and `arther-app-ia.md` (§4.4); realizes the Content Reuse spec (v1.1). The **insert panel** and **in-document override/signalling** live in the **Editor** (boundary noted).
**Decisions this pass:** (1) the Snippets mode rail = **Snippets · Templates · Archived** *(refines app-ia §4.4's "Snippets · Block Library" — the **Block Library** is the whole mode; it's split by item type for clarity)*; (2) the **Navigator** is the item list + folders + search; the **content** is the selected item's detail (or a full-canvas **item editor**); the **Inspector** is **Usage + Lifecycle**; (3) **Snippets** are live (transclusion), **Templates** are copy-on-insert — the type is the organizing distinction; (4) override + visual signalling happen **in the Editor**, not here; this mode is **author + govern at the source**; (5) deletion is **blocked while embeds exist** (archive instead).

**This IA owns the library + source authoring/governance.** The **insert** experience (block-library panel), the **embedded-snippet signalling** (left border, edit-warning banner), and the **document-level override** flow are **Editor** surfaces (Editor IA). Snippets here is where items are **created, edited at source, versioned, and where stale-prose/embeds are governed**.

---

## 1. Purpose & Scope

Snippets is the single source for content that must stay consistent across many documents — a regulatory boilerplate paragraph, an "Electrical Summary" block, a standard safety callout — plus the **templates** that save setup time without staying linked. Because snippets use **live transclusion**, editing one here updates every embedding document at once; that power is why the library is also the place to **govern** reuse: see where an item is embedded, resolve stale prose once at the source, version and roll back, and never break a reference.

**In scope:** the **library views** (Snippets · Templates · Archived) with name · type · owner · **embed count** · state · search/folders; the **item detail + Usage/Lifecycle Inspector**; the **full-canvas item editor** (same block editor); **creation** (promote-from-document and direct authoring); **snippet lifecycle** (versioning, rollback, deletion-block); **stale-prose-at-source** governance; states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** the **insert panel**, **embedded-snippet signalling**, and **document-level override** (Editor IA); the **transclusion/override data model** + nested-snippet constraint internals (Content Reuse spec); the **block editor** mechanics (Editor IA); spec-token resolution + staleness engine (Smart Spec Tracking); the **Dashboard** snippet-review action item (Dashboard IA — it deep-links here); document **duplication** (Editor/Content Reuse flow); and all visual / design-system work.

---

## 2. Where Snippets Sits (shell recap)

Snippets is a top-level **mode**. Per the shell: the **local rail** holds its views (**Snippets · Templates · Archived**); the **Navigator** is the item **list + folders + search**; the **content area** shows the **selected item** (preview/detail) or, when authoring, a **full-canvas item editor**; the **Inspector** holds **Usage** (where embedded) + **Lifecycle** (state, version history). The two governing principles hold: **left organizes** (the list), **right modifies/contextualizes** (Usage + Lifecycle). The library item editor is the same block editor used in documents, opened full-canvas.

---

## 3. Surface & View Map

- **Snippets** (rail view) `/snippets` *(default)* — live-transclusion items
  - **Item detail** `/snippets/{id}` — preview + Usage/Lifecycle Inspector
  - **Item editor** (full-canvas) `/snippets/{id}/edit` — author the block sequence; **"editing a snippet — applies to N documents"** banner
  - **Stale-prose at source** `…/{id}?flag=stale` — the snippet's stale-prose review (resolve once → clears everywhere)
  - **Source-changed** context — when overrides exist downstream (informational here; resolved in the Editor/Dashboard)
  - **Delete-blocked** dialog — "embedded in N documents — reassign / remove / convert first" → **Archive instead**
- **Templates** (rail view) `/snippets/templates` — copy-on-insert items (name · owner · #inserts); item editor (full-canvas)
- **Archived** (rail view) `/snippets/archive` — retired items (restore)
- **[in Editor] Insert panel** — the block-library browse/search panel that inserts a snippet (embed) or template (copy) at the cursor *(Editor surface — referenced)*
- **Empty (first-run)** — "Save reusable content to the library" entry
- **Loading** — chrome first; list / editor / inspector skeletons

---

## 4. Navigation Model

- **Primary (mode-level):** the **rail** switches **Snippets · Templates · Archived**.
- **In-surface:** the **Navigator** is the item list with **folders** + **search**; selecting an item shows its **detail + Inspector**; **New item** (snippet/template) + **promote-from-document** are the two creation entries.
- **Detail → edit:** opening an item's editor is **full-canvas** (the block editor); a back returns to the library.
- **Govern:** the **Inspector → Usage** lists embedding documents (and the **embed count**); **Lifecycle** shows state + version history (rollback). A **stale-prose flag** on a snippet opens the source review.
- **Cross-links:** the **Dashboard** `snippet_review` item deep-links to the snippet's stale-prose review; **inserting** happens in the **Editor** (this mode is the source of truth, not the insertion point).
- **Keyboard / Mobile:** desktop-only.

---

## 5. Region Content Hierarchy

### Navigator (left) — item list
1. **The list** — items in the active view (Snippets / Templates / Archived); **search** + **folders**; **New item**.
2. Each row: name · **type** (Snippet/Template) · owner · **embed count** (snippets) · a **state/stale** marker.

### Content (center) — detail or editor
- **Item detail (default):** the snippet's **rendered preview** (its block sequence) + identity (name, owner, type); primary actions **Edit · Duplicate · Archive**.
- **Item editor (full-canvas):** the **block editor** authoring the sequence; a persistent **"editing a snippet — applies to N documents"** warning; Save creates a new **version**.
- **Stale-prose review:** the flagged prose in context + the spec change that triggered it; **Resolve** (edit + clear everywhere).

### Inspector (right) — Usage + Lifecycle
- **Usage:** **embedded in N documents** — the list of embedding documents (with override state per document: live / overridden / source-changed); "used by" is the governance view.
- **Lifecycle:** current **state**, **version history** (each edit = a version; **rollback**), owner, last-updated; **delete** (blocked with the embed count → Archive).

---

## 6. Snippet Lifecycle & Override (recap — where it surfaces)

- **States (per embed, shown in Usage):** **Live** (showing source) · **Overridden** (doc-owner custom content) · **Source-changed** (source edited after an override — needs the doc owner's review). *Override is applied/edited in the **Editor**; here it is **visible** in Usage and drives the owner's notification.*
- **Versioning/rollback:** every edit = a version; rollback propagates to **live** embeds automatically; **overridden** embeds get a review alert (not auto-applied).
- **Stale prose:** a spec change can flag a snippet's prose → flag in the library + on every embedding document; **snippet owner resolves at source** (clears everywhere) or a **doc owner resolves locally** (creates an override).
- **Deletion:** **blocked while embeds exist** — reassign / remove / convert first, or **Archive**.
- **No nested snippets** (a snippet can't embed another) — authored directly.

---

## 7. User Flows

### Promote document content to a snippet
1. In the **Editor**, select whole blocks → **Save to Library** → choose **Snippet** (live) or **Template** (copy) → name + owner → the document's blocks become a live **embed**; the item now lives here.

### Author directly in the library
1. Snippets → **New item** → type + name + owner → **item editor** (full-canvas) → author blocks → Save → available to insert.

### Edit a snippet at source (the power + the warning)
1. An item → **Edit** → the **"applies to N documents"** banner persists → edit → Save (new version) → **all live embeds update**; overridden embeds get a review alert.

### Resolve stale prose once
1. A snippet shows a **stale-prose flag** (also a Dashboard `snippet_review`) → open the **source review** → edit the prose → Save → the flag + every document's indicator **clear at once**.

### See/limit blast radius before editing or deleting
1. **Inspector → Usage** → "embedded in 12 documents" with per-document override state → informed edit; **Delete** is blocked here (Archive instead).

### Roll back
1. **Inspector → Lifecycle → version history** → roll back to a prior version → live embeds revert; overridden embeds get the review alert.

---

## 8. States

Snippets list · Templates list · Archived list · item detail (preview) · item editor (full-canvas, edit-warning banner) · stale-prose source review · Usage (embeds + override states) · Lifecycle (version history) · delete-blocked dialog · empty (first-run) · Loading.

---

## 9. Naming Conventions

| Concept | Label | Notes |
|---|---|---|
| The mode / library | **Snippets** / **Block Library** | Block Library = the umbrella; rail splits by type |
| Live reusable unit | **Snippet** | Transclusion; edit-at-source updates all embeds |
| Copy-on-insert unit | **Template** | Independent copy; not linked (Document/Block Template) |
| Use in a document | **Embed** | A `SnippetEmbed` reference; counted as "embedded in N" |
| Doc-local change | **Override** | live · overridden · source-changed (applied in the Editor) |
| Out-of-date prose | **Stale prose** | Flag at source; resolve once clears everywhere |
| Retired item | **Archived** | Not deleted (deletion blocked while embedded) |

---

## 10. Component Reuse Map

| Component | Source | Use in Snippets |
|---|---|---|
| Top bar · Local rail · Navigator · Inspector | App-shell | The mode frame; rail = 3 views |
| Doc card / Table row · Field row · Section subhead | DS | Library list rows, Usage list, version history |
| **Block editor** | Reuses Editor | The full-canvas item editor + the detail preview |
| Status pill · Spec token · Avatar | DS | Type/state pills, tokens inside snippets, owners |
| Safety block · Warning banner | DS / new | The "applies to N documents" edit banner; stale-prose flag |
| Button · Tab · Text field | DS | Actions, Inspector tabs, search |
| Skeleton | DS | Loading |

---

## 11. Content Growth Plan

- **Items** grow → **folders** + **search** + type views (Snippets/Templates/Archived) keep the library navigable.
- **Embeds per snippet** grow → Usage paginates; the embed count is always visible (blast-radius awareness).
- **Versions** accumulate → Lifecycle history paginates; rollback to any.
- **Stale flags** → routed via the Dashboard; resolved once at source.

---

## 12. URL Strategy

- Views: `/snippets` (Snippets, default) · `/snippets/templates` · `/snippets/archive`.
- Item: `/snippets/{id}` (detail) · `/snippets/{id}/edit` (full-canvas editor) · `?panel=usage|lifecycle` · `?flag=stale`.
- Insert happens in the Editor (`/documents/{id}/edit` block-library panel) — not under `/snippets`.
- Reserves `/{workspaceSlug}/…` per the shell.

---

## 13. Resolved Decisions (this pass)

1. **Rail = Snippets · Templates · Archived** (refines app-ia §4.4: the Block Library is the mode; split by item type for clarity).
2. **Library = Navigator list + folders/search; content = detail or full-canvas editor; Inspector = Usage + Lifecycle.**
3. **Snippets (live) vs Templates (copy-on-insert)** is the core distinction; the type drives behaviour (transclusion vs. independent copy).
4. **Authoring + source governance live here; insert + override + signalling live in the Editor** — the boundary is explicit.
5. **Deletion blocked while embedded** → Archive; the embed count is the blast-radius signal everywhere.
6. **Stale prose resolves at source** (clears all embeds) or locally in a document (creates an override) — the source resolution is canonical.

*Open (resolve during build):* whether item **detail** is a separate surface or the editor opens directly; whether **Usage** override-state filtering is needed at launch; folder depth.

---

## 14. Out of Scope (this pass)

The **insert panel** + **embedded-snippet signalling** + **document-level override** (Editor IA); the transclusion/override **data model** + nested-snippet constraint (Content Reuse spec); the **block editor** mechanics (Editor IA); spec-token resolution + the **staleness engine** (Smart Spec Tracking); the **Dashboard** snippet-review item (Dashboard IA); document **duplication** (Editor/Content Reuse); responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — Snippets (Content Reuse) Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the reusable-content library: rail views (Snippets · Templates · Archived), the item list + folders + search, the full-canvas item editor (with the edit-applies-to-N-documents warning), the Usage + Lifecycle Inspector, and source governance (versioning/rollback, stale-prose-at-source, deletion-block). Insert, signalling, and document-level override are Editor surfaces. Extends `arther-app-shell-ia.md` and `arther-app-ia.md` (§4.4); realizes the Content Reuse spec v1.1. Next: the Cross-cutting IA (assistant / notifications / command palette), then the Public Portal visitor IA.*
