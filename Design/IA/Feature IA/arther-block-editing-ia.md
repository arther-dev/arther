# Information Architecture: Arther — Block Editing (Deep Editor)

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **granular block-editing layer** inside the Documents · Editor. **Net-new** (deepens the existing `arther-editor-ia.md`, which fixed the 3-panel shell). Realizes the Visual Block Editor spec v1.2 (block-first model, 20 block types, inline spec tokens, Edit/Preview, static contracts, containers, snippet transclusion, find/replace, search). Extends `arther-editor-ia.md` and `arther-app-ia.md`.
**Decisions this pass:** (1) the deep editor is a set of **transient surfaces over the 3-panel shell** — slash menu, `/spec` token picker, token popover, the context-sensitive Properties panel, drag/multi-select, the Edit↔Preview toggle, the snippet treatment, image drop, block conversion, and find/replace — **not** a new page layout. (2) **Tokens are atomic chips** in Edit mode, plain values in Preview. (3) **Edit / Preview(Portal) / Preview(PDF)** is a hard mode split (no WYSIWYG). (4) **Placeholder** blocks are non-editable and **block publishing**; **snippet** blocks are non-editable live transclusions. (5) one-level **container** nesting only (Accordion · Step Wizard · Safety); the slash menu inside a container offers only permitted children.

---

## 1. Purpose & Scope

This is where AI-generated drafts become finished documents. The primary act is **refinement of generated output**, not blank-canvas authoring, so every surface here protects what the generator produced — spec tokens, block source metadata, references — while letting prose flow freely. It must make block structure legible, make spec linkage visible and safe, and make the gap between "what I'm editing" and "what readers get" unambiguous (Edit vs Preview).

**In scope:** block **insertion** (slash menu, categorized) and **/spec token insertion** (two-level picker); **block selection** + the three context **Properties** variants (block/spec-ref, Spec Table, Hotspot Image) + document-level properties; **inline token chips** + token popover; **drag-reorder** + multi-select; **Edit / Preview(Portal) / Preview(PDF)** modes + static contracts; the **20 block types'** edit-mode appearance (incl. safety, callout, code, containers, ToC, page break); **snippet** transclusion treatment + "snippet updated" notice; **image drag-drop** upload; **block-type conversion** + destructive container-convert confirm; **find & replace**; **staleness** surfacing in the outline + properties; the **optimistic-lock** banner; the **empty manual document** state.

**Out of scope (boundaries):** the **3-panel shell** itself (Outline/Canvas/Properties regions, floating toolbar — `arther-editor-ia.md`); **AI generation** (New Document flow — generation happens before the editor; no chat/prompt in the editor); **review/approve + comments model** (Reviews IA + Collaboration spec — the editor only renders read-only review mode + anchors comments); **snippet authoring** (Snippets IA); **Spec Database** value editing (tokens link out to it); **publish/snapshot/PDF-render** pipeline (Portal); **global ⌘K search** (Cross-cutting — only the in-document Find/Replace is here); canvas layout tools, font/size control, co-editing, custom blocks, mobile editing, DOCX (all spec §8 out-of-scope).

---

## 2. Where It Sits

Everything here lives **inside Documents · Editor**, on the **centre block canvas** and the **right Properties panel**, plus a set of **transient overlays** (slash menu, token picker, token popover, find bar, conversion menu, confirm dialogs) and the **Preview** render of the centre panel. The **left Outline** (from the Editor IA) is the staleness/navigation surface. No new chrome — the deep editor is interaction depth on the existing shell.

---

## 3. Interaction Surface Map

- **Slash menu** (`/`) — categorized block picker (Structural · Prose · Data · Safety · Media · Containers · Reuse); filters as you type; inside a container, only permitted children appear
- **/spec token picker** — two-level (Primary product → component → field; Other products below); inserts an atomic chip
- **Block selection → Properties** — left accent bar on the block; panel shows: document-level (no selection) · block + **spec references / staleness** · **Spec Table** (columns + draggable rows) · **Hotspot Image** (pin list) · media (replace)
- **Token chip → popover** — hover = field/component/product tooltip; click = field detail + "open in Spec Database" (read-only here)
- **Drag-reorder** — per-block drag handle (⠿) + drop indicator; **shift-click multi-select** → move/delete together
- **Edit ↔ Preview** — header toggle `[Edit] [Preview ▾]` → Portal / PDF; Preview hides chrome, renders tokens plain, applies static contracts; PDF shows page boundaries
- **Snippet block** — live transclusion: bordered, "Snippet" badge + "Edit source →", non-editable; "snippet updated" notice
- **Image drop** — drag a file onto the canvas → drop indicator → ImageBlock (or replace on an existing media block)
- **Block conversion** — handle/context menu → compatible types; **container→leaf** = destructive confirm dialog
- **Find & replace** (⌘F) — in-document bar; plain-text only (tokens excluded)
- **Staleness** — amber `●` in the outline + per-block spec-reference status in Properties
- **Optimistic lock** — "Jane has this open" banner (Open read-only / Edit anyway)
- **States:** edit (populated) · placeholder block (non-editable, blocks publish) · empty manual document · preview (Portal) · preview (PDF) · lock banner.

---

## 4. The 20 Block Types (edit-mode catalog)

Grouped exactly as the slash menu presents them; **containers** hold one level of children.

- **Structural:** Section Header · Divider · Page Break (dashed labelled line in edit; PDF-only) · **ToC** (live, auto from section headers)
- **Prose:** Heading (H2/H3) · Paragraph (carries inline tokens) · **Code Block** (plain text + language; never AI-gen) · **Callout** (info/tip/important — themeable, *not* a safety block)
- **Data:** **Spec Table** (live view; configure columns/rows, never values) · **Chart** (view over a table-type spec field)
- **Safety (containers):** **Warning** (red) · **Caution** (amber) · **Note** (blue) — enforced, non-themeable styling (ISO 82079 / ANSI Z535.6); children: Paragraph/Heading/Image
- **Media:** Image · Video · GIF · **Hotspot Image** (numbered pins + legend)
- **Containers:** **Accordion** (sections; all expanded in edit) · **Step Wizard** (numbered steps)
- **Reuse:** **Snippet** (live transclusion; non-editable in canvas)

**Source taxonomy** (visual signal in canvas/Properties): spec · brief · **placeholder** (non-editable, blocks publish) · manual · snippet.

---

## 5. Properties Panel Variants

1. **No selection → Document properties:** Title · Primary product · Brand Profile · Document Type · Page size · Release.
2. **Block selected → Block + Spec references:** Type · Source · **spec references** with per-field version status (current ✓ / **stale ⚠** showing gen-version → current) + "go to field"; **Degradation** (PDF static contract, default or override).
3. **Spec Table selected:** Product · **Columns** (Min/Typical/Max/Conditions/Source toggles) · **Rows** (draggable, add/remove, per-row label override + hide) · Degradation.
4. **Hotspot Image selected:** Replace image · **Pins** (numbered list, add/remove) · Degradation (numbered legend).
5. **Media selected:** Replace + alt text + caption + width.

---

## 6. Modes & Static Contracts

- **Edit** — chips, handles, slash menu, Properties active.
- **Preview · Portal** — interactive web render; tokens plain; chrome hidden.
- **Preview · PDF** — headless-Chrome static layout at page size; **static contracts** applied (Accordion→flat sections, Step Wizard→numbered list, Video→thumbnail+URL, GIF→first frame, Hotspot→numbered legend, Chart→static image); page boundaries shown.
- Static contract has a per-type **default** (Arther-enforced) + per-block **override** in Properties.

---

## 7. Token Model

Inline spec values are **atomic tokens**, not text: a chip in Edit (value + field-name on hover; click → popover → Spec Database), plain value in Preview. A range/toleranced field is **one** token. Insert via **/spec** (product→component→field; multi-product allowed at token level). Tokens are **excluded** from Find/Replace and are never editable in the document — values change in the Spec Database, the display updates automatically (the mechanism behind Smart Spec Tracking).

---

## 8. States

Edit (populated) · placeholder block ("Brief content needed → Go to Product Brief", non-editable, blocks publish) · empty manual document (slash-command hint) · stale block (outline `●` + Properties ⚠) · snippet block (live, "Edit source") + snippet-updated notice · Preview (Portal) · Preview (PDF, page boundaries) · optimistic-lock banner · find/replace active.

---

## 9. Naming Conventions

| Concept | Label | Notes |
|---|---|---|
| Insert block | **Slash menu** (`/`) | categorized; container-aware |
| Insert spec value | **/spec** token | atomic chip |
| Spec value in prose | **Token** | chip (edit) / value (preview) |
| Working vs rendered | **Edit** / **Preview** | Preview → Portal / PDF |
| Non-interactive render | **Static contract** | default + per-block override |
| Missing-brief block | **Placeholder** | blocks publishing |
| Live reuse | **Snippet** | "Edit source" |
| Safety notices | **Warning / Caution / Note** | non-themeable |

---

## 10. Component Reuse Map

| Component | Source | Use |
|---|---|---|
| 3-panel shell (Outline/Canvas/Properties) | Editor IA / app shell | The frame every deep screen sits in |
| Floating editor toolbar | DS Editor-toolbar (Authoring/Review) | Already on editor frames |
| Slash menu / token picker / conversion menu | New (overlay) — reuses command-palette/menu pattern | Insertion + conversion |
| Token chip + popover | New (inline) | Spec tokens |
| Block-type leaves (safety, callout, code, table, hotspot, accordion, wizard, snippet) | New block components | Canvas content |
| Text field · Button · Toggle · Divider · Avatar · Icon set | DS | Properties controls + overlays |
| Find bar · lock banner · confirm dialog | New + DS (Button) | Transient surfaces |

All dark + DS-token-bound (the editor is app surface, monochrome DS). The **document paper** (canvas content area) is the light "paper" tone, consistent with the rest of the editor.

---

## 11. Resolved Decisions (condensed from spec §6)

1. **Block-first** (only model that anchors spec refs + staleness + static contracts per block).
2. **Token model** (non-editable values, free prose) over edit-and-break / edit-and-preserve.
3. **Edit/Preview split**, not WYSIWYG (three render targets can't be shown at once).
4. **One-level containers** (expandable sections + step sequences; no recursive tree).
5. **Static contracts as defaults + per-block override.**
6. **Safety blocks first-class + non-themeable** (compliance); **Callout** is the themeable info highlight.
7. **Snippets non-editable in canvas** ("Edit source"); **not allowed inside containers.**
8. **Find/replace excludes tokens**; spec values flow one way (DB → document).

---

## 12. Out of Scope (this pass)

The 3-panel shell layout (Editor IA); AI generation / regeneration prompt in-editor; the review/comment model (Reviews IA + Collaboration spec); snippet authoring (Snippets IA); Spec Database value editing; publish/PDF-render pipeline (Portal); global ⌘K search (Cross-cutting); canvas layout tools, font/size selection, real-time co-editing, custom block types, mobile editing, DOCX/ePub export (spec §8).

---

*Arther — Block Editing (Deep Editor) Information Architecture. Version 0.1, 6 June 2026. The granular editing layer inside Documents · Editor: the slash block menu, the /spec atomic-token picker, the three context-sensitive Properties variants, inline token chips + popover, drag-reorder + multi-select, the Edit / Preview(Portal) / Preview(PDF) mode split with per-block static contracts, the full 20-block-type catalog (incl. safety, callout, code, containers, ToC), snippet live-transclusion treatment, image drag-drop, block-type conversion with destructive-container confirm, in-document find & replace, and staleness surfacing. Deepens `arther-editor-ia.md` and realizes the Visual Block Editor spec v1.2.*
