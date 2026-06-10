# Arther Handoff · 03 — Screens, Part 1 (Core surfaces)

**Source file:** Arther — Screens · Figma key `pdMPtD58F3MeLrTzWsoX3E`
**Covers:** Dashboard · Specs · New Document flow · Editor (+ deep block editing) · Reviews.
**Read first:** `01-foundations-design-system.md` (tokens/components) and `02-app-shell-and-patterns.md` (shell, overlays, a11y spec, motion). Each surface below assumes the shell and inherits the file-wide a11y requirements; only surface-specific a11y is repeated.

Per-surface format: Overview · Route & shell · Layout · Components · States · Interactions/flows · Edge cases · Data/RSC · Figma.

---

## A. Dashboard — `/dashboard`

**Overview.** The default post-login surface and the personal **"what needs me now"** action queue (the Action Dashboard from Smart Spec Tracking, generalized). Information-dense, scoped to the current user (`assigned_to == me`), newest-first. The workspace-wide review pipeline lives in Documents → Reviews; Dashboard items deep-link there, never duplicate it.

**Route & shell.** `/dashboard`. Rail exception: **no local rail, no Inspector**. Single content surface; optional Overview/Activity segmented control. The **review modal** is a global overlay that returns the user to scroll position on close.

**Layout (top→bottom).** (1) Greeting + date. (2) **Stat-tile row** — Awaiting your approval · Section reviews · Override reviews · Stale documents (workspace; the only non-personal tile → deep-links Portal → Analytics). Each tile is a filter shortcut. (3) **Action queue** grouped by action type under collapsible headers (Awaiting approval · Section reviews · Overrides · Snippet reviews · Mentions · Briefs), ordered by urgency, newest-first within a group.

**Action-item taxonomy (7 types × 3 interaction modes).**

| Type | Mode | Behavior |
|---|---|---|
| `override_review` | **Act here** | Inline Confirm · Update · Remove (no leave) |
| `section_review` | **Review modal** | git-diff modal → Approve / Edit prose / Open full document |
| `snippet_review` | **Review modal** | same modal on the snippet's prose; resolving notifies embedders |
| `document_approval` | **Navigate** | → `/documents/{id}/edit?dialog=publish` |
| `comment_mention` | **Navigate** | → Editor at the comment |
| `placeholder_brief` | **Navigate** | → Specs → Brief tab |
| `review_requested` | **Navigate** | → Reviews queue / Review surface |

**Review modal (3 zones).** What changed (left: FieldChangeDiff list) · Section to review (right: working-copy prose, auto-updated tokens as chips, clean merges `✓`, potential conflicts `⚠`) · Actions (Approve section · Edit prose [lightweight inline — text + token insert only] · Open full document ↗). Resolving the **last** section review for a doc creates the owner's `document_approval` card.

**Components.** Metric card (tiles) · **Action card** (new; variant per interaction mode) · Wizard step (first-run checklist — the mockup draws these rows ad hoc; build them from Wizard step) · **Review modal** (new, 3-zone — diff render shared with Reviews) · Spec token, Status pill, Avatar, Button, Tab, Skeleton.

**States (12) with precedence.** Evaluated top-down, first match wins: (1) **First-run** — workspace lacks Brand Profile OR Document Type OR product → admin **setup checklist**: **4 counted steps** (Brand Profile → Document Type → Invite → Add product) + an uncounted **"Generate your first document" goal row** (hence the mockup's "1 of 4 done" counter); members see "Generate your first document" empty. (2) **Action queue (has items)**. (3) **All caught up** (single ghost CTA). Plus: Show-resolved · filtered-by-type · review modal (section / snippet / edit-prose) · Activity feed · Loading. First-run and all-caught-up can never co-qualify (ordered + exclusive).

**Interactions.** `j/k` move cards · `↵` open primary action · `e` Edit prose in modal · `Esc` close. Stat tiles filter the queue. Consolidation: multiple same-category changes to one section collapse into one card.

**Edge cases.** Zero items is a *designed* goal state, not an afterthought. Half-set-up workspace is never shown a normal queue (first-run precedence). Resolved items leave the queue, recoverable via Show resolved.

**Data/RSC.** Queue + tiles are server-rendered from `DashboardActionItem` rows (scoped by user). The review modal's diff is server-computed; Edit-prose is a client mutation via server action. Items arrive/clear via the propagate + notification tasks (Realtime refresh).

**a11y.** Review modal = `role="dialog"` + trap + Esc + focus restore. Cards keyboard-operable (`j/k/↵`). Stat tiles, if actionable, expose it.

**Figma.** Page `247:911` · section `258:1111` (6 frames). Review modal `250:911` (note: it is fully dark — not a light-paper modal) · First-run checklist `250:1009` · All caught up `250:1107`.

---

## B. Specs — `/specs`

**Overview.** The source of truth: products, shared components, releases, fields, briefs, variants, coverage, domain ownership, import/export. Everything downstream reads from here.

**Route & shell.** Rail = **Products** (`/specs`) · **Component Library** (`/specs/components`) · **Releases** (`/specs/releases`). Navigator = component tree/list. Content = field grid (or the active content-area tab). Inspector = selected field's **Detail / History / Comments**. Navigator + Inspector pinned-open, collapsible.

**Layout — product page.** Contextual toolbar carries **content-area tabs: Spec Fields · Product Brief · Variants · Coverage** (Variants/Coverage on products only; components get Spec Fields + Brief). The 3-panel layout lives **inside Spec Fields**: tree (Navigator) · field grid grouped by category (Content) · field Inspector (right).

**Spec Fields content.** Field grid grouped by category (Electrical, Mechanical…), inline-editable. `[!]` downstream-impact badge on fields whose change would stale documents. Shared-component banner + per-field **Edit (global) / Override (product-specific)** — active override shows "24 V ← (global: 36 V)". **Table fields** expand into a **full-width table editor** (Excel paste, series, live chart preview) that takes over the content area. **Reference fields** open a side panel (context preserved).

**Inspector tabs.** Detail (type-specific editor: value · unit · conditions · source rated/typical/measured/calculated · required/internal flags · Edit/Override · spec references with `[!]`) · History (immutable version feed, row-level diff for tables) · Comments (data-accuracy notes with **value-at-comment** badge, one-level replies, @mention, no resolution state, admin-only delete) · combined "Activity" toggle interleaves the two.

**Eight field-type editors.** scalar · range · toleranced · boolean · enum · multi-enum · table · reference. Table = mini-spreadsheet.

**Full-canvas sub-flows.** **Variant delta editor** (`/specs/product/{id}/variant/{variantId}/edit` — 3-panel: base graph · delta list [scalar override / component swap/add/remove] · resolved preview) · **Comparison view** (read-only) · **Import/Re-import** (own flow, doc 04 §B). **Domain Ownership** = per-product panel (`?panel=ownership`) reading workspace defaults (Settings).

**Components.** Field-type editors (new) · Table editor (new) · Version feed / Comment thread (shared with Editor) · Shared-component banner / Override control (new) · Variant delta editor (new) · Coverage report / Domain-ownership panel (new) · Field row, Section subhead, Status pill, Spec token, Tab, Avatar, Skeleton.

**States.** Default (Spec Fields) · field selected · table editor (full-width) · shared/override · orphaned · stale `[!]` · pre-commit impact · variant delta editor · comparison · import/re-import · release/create-release · empty (first-run: Import from Excel / Start from template) · loading.

**Interactions.** Edit a field → auto-saved as immutable version → **pre-commit impact note** ("triggers review in N documents") on save; structured tokens auto-update, prose flagged. Override blocks field-type change while overrides exist. Create Release = immutable snapshot; generation targets Latest or a named release.

**Edge cases.** Changing a shared field's type is blocked while overrides exist. Re-import is additive (removed fields flagged, never deleted). Deep component graphs scroll/collapse in the Navigator.

**Data/RSC.** Field grid + tree server-rendered; field edits = server actions writing immutable `field_versions` + advancing `current_version_id` in one txn, then emitting `spec_field_updated` → propagate task. Staleness is the indexed join over `block_spec_references` (architecture §5.2). Export = xlsx/csv (resolved spec).

**a11y.** Spec table needs `scope` headers + table semantics. `[!]` badge needs a text/aria equivalent, not color-only. Inline-edit fields need labels.

**Figma.** Page `199:911` · hero `200:911` · sections `233:1798` / `233:1799` / `233:1800` (14 frames: Detail · History · Comments · Override · Table editor · Brief · Variants · Coverage · Component Library · Releases · Variant editor · Import · Empty · Loading).

---

## C. New Document flow — `/documents/new`

**Overview.** The front door to authoring — where structured data becomes a draft. A **deterministic single-screen configuration flow**, never a chat/prompt box. Pick Document Type · Product (+release) · Brand Profile; see live pre-flight completeness; atomic generate → stream → Editor.

**Route & shell.** **Full-canvas flow** — opens as a tab, hides rail/Navigator/Inspector, keeps the top bar, returns to the prior tab on Cancel or hands off to the Editor on success. Surfaces: Configure (`/documents/new`) · Generating (`/documents/new/generating`) · Review & generate sibling (`/documents/generate-offer`).

**Configure layout (two columns).** Header: "New document" + Cancel + **Generate now** (disabled until Type + Product set). **Left (selections, in order):** Document Type (searchable list, built-in/forked indicator) → Product + **release selector** (defaults Latest) → Brand Profile (workspace default preselected; collapses to one line if only one) → Quality Standard (read-only, inherited from the type). **Right (live pre-flight):** per-section status (✓ complete · ○ brief needed · ○ spec field empty), summary line ("7 of 10 sections will generate fully · 3 placeholders"), resolution links (`[Add brief first]` beside `[Generate now]` — both valid, **no blocking gate**).

**Generating layout.** Status stream (queued → generating ⧖ → complete ✓; placeholders marked up front, never attempted) + live preview (document assembling block-by-block) → auto-transition into the Editor.

**Review & generate (sibling).** The auto-offer after a brief is added: context line (what changed; component blast-radius form lists affected products) + affected-documents list (per-doc opt-in checkbox) + Generate selected / Dismiss.

**Components.** Select list / searchable picker (new) · Pre-flight section row (new) · Stream status row (new) · Live preview pane (reuses block-renderer read-only) · Wizard step · Tab, Button, Text field, Status pill, Avatar, Doc card.

**States.** Configure · Configure all-complete · Configure with-placeholders · blocked (no products → Specs) · blocked (missing prerequisites → Settings) · Generating (streaming) · Generating (complete failure → single Retry, no draft) · Editor hand-off with placeholders · Editor hand-off partial failure (draft + red error blocks, section-level retry) · Review & generate (product / component blast radius) · Loading.

**Interactions.** `⌘↵` Generate now (when valid) · `Esc` Cancel. "Add brief first" opens Specs → Brief (configure tab persists; return re-computes pre-flight). Release-pinned generation locks inline tokens to that release's field versions (no auto-update, no staleness).

**Edge cases.** **Placeholders never block generation** (a feature, not an error) — they become distinct, publish-blocking placeholder blocks in the Editor. Complete failure preserves selections, creates nothing. Partial failure saves a draft with error blocks (distinct from placeholders).

**Data/RSC.** Pre-flight is computed client/server from the type's data contracts vs. the product's current data — instantaneous, no generation. Generate enqueues the Trigger.dev `generate-document` task (per-section Claude tool-use, atomic commit; architecture §5.1); status streams via Realtime.

**a11y.** Searchable pickers need listbox semantics + keyboard. Pre-flight `○`/`✓` not color-only. Error blocks identified in text.

**Figma.** Page `236:911` · section `245:1087` (6 frames: Configure ±placeholders · Generating · Failed · Review & generate · Blocked). Configure — all complete `239:911` · Generating `239:1039`.

---

## D. Editor — `/documents/{id}/edit` (+ deep block editing)

**Overview.** The 80%-of-time surface where AI-generated drafts become publishable. Primary act is **refinement of generated output**, not blank-canvas authoring — every surface protects spec tokens, source metadata, and references while letting prose flow. The anchor of the product: a calm light "paper" document on dark chrome.

**Route & shell.** Documents mode surface. Top bar persists; **Outline** = Navigator (left); **block canvas** + contextual toolbar = content; **tabbed Inspector** (Properties / Comments / History) = right. Outline + Inspector pinned-open, collapsible, hidden in Focus mode. Two render modes: **Edit ⇄ Preview** (Portal / PDF / DOCX).

**Contextual toolbar.** Document title + primary product + **save state** ("Last saved 2s ago") · Edit ⇄ Preview toggle · primary action **Publish** (or **Request review** when not yet approved) · secondary (Share, page size, Focus, ⋯) · panel-collapse toggles.

**Outline.** Section list (from Section Header blocks; click → scroll+select) · per-section **staleness ●** (amber) · word-count indicator (amber over limit, soft) · empty: "Sections appear as you add headings."

**Block canvas.** Ordered block sequence (continuous scroll, no page boundaries — pagination is PDF-only) · selected block (left accent bar, drives Inspector) · inline spec tokens (chips in Edit, plain values in Preview) · block-source signals (placeholder "Brief content needed → Go to Product Brief"; snippet "Edit source →", non-editable; stale amber) · insertion affordances (slash `/`, drag handles ⠿, drop indicators, multi-select).

**Inspector — Properties variants.** (1) No selection → **document properties** (title, primary product, brand profile, document type, page size, release). (2) Block selected → **block + spec references** (each with version status current ✓ / stale ⚠ gen→current + "go to field") + **degradation** (PDF/DOCX static contract: default + per-block override). (3) Spec Table → columns (Min/Typical/Max/Conditions/Source toggles) + rows (draggable, add/remove, per-row label override + hide). (4) Hotspot Image → replace + numbered pins. (5) Media → replace + alt + caption + width. **Comments tab** = block-anchored threads (reviewer default). **History tab** = document-level (releases + change feed) when nothing selected; block-level edits within the current revision when a block is selected.

**Deep block editing (transient surfaces over the shell — no new layout).** Slash menu `/` (categorized: Structural · Prose · Data · Safety · Media · Containers · Reuse; inside a container only permitted children appear) · `/spec` token picker (two-level: Primary product → component → field; other products below; search-first) · token chip popover (hover = field/component tooltip; click = detail + "open in Spec Database", read-only here) · drag-reorder + shift-click multi-select · block-type conversion (container→leaf = destructive confirm dialog) · image drag-drop · find & replace `⌘F` (plain text only — tokens excluded) · optimistic-lock banner.

**The 20 block types** (grouped as the slash menu shows them):
- **Structural:** Section Header · Divider · Page Break (dashed labelled line in edit; PDF-only) · ToC (live, auto from headers)
- **Prose:** Heading (H2/H3) · Paragraph (carries tokens) · Code Block (plain, never AI-gen) · Callout (info/tip/important — themeable, *not* a safety block)
- **Data:** Spec Table (live; configure columns/rows, never values) · Chart (view over a table-type field)
- **Safety (containers):** Warning (red) · Caution (amber) · Note (blue) — **non-themeable** (ISO 82079 / ANSI Z535.6); children Paragraph/Heading/Image
- **Media:** Image · Video · GIF · Hotspot Image (numbered pins + legend)
- **Containers:** Accordion · Step Wizard (one-level nesting only)
- **Reuse:** Snippet (live transclusion, non-editable; not allowed inside containers)

**Source taxonomy** (visual signal): spec · brief · **placeholder** (non-editable, blocks publish) · manual · snippet.

**Modes & static contracts.** Edit (chips, handles, slash, Properties) · Preview · Portal (interactive web render; tokens plain; chrome hidden) · Preview · PDF (headless-Chrome static layout at page size — Accordion→flat sections, Step Wizard→numbered list, Video→thumbnail+URL, GIF→first frame, Hotspot→numbered legend, Chart→static image; page boundaries shown). Each block type has a default contract + per-block override.

**Components.** Block components (one family per type — new) · block controls (drag handle, ⋯, accent — new) · slash menu / token picker / conversion menu (new overlays, reuse menu pattern) · token chip + popover (new) · Outline item (new) · comment thread + composer (new) · spec-reference row / degradation control / diff preview (new) · lock banner (new) · Editor toolbar (DS, Authoring/Review) · Inspector, Tab, Button, Status pill, Avatar, Safety block, Field row, Skeleton.

**States.** Default (Edit) · block selected · empty (bare canvas, slash hint) · loading (chrome + skeleton blocks) · locked (advisory banner) · stale alert (amber Outline + Inspector) · Preview (Portal/PDF/DOCX) · Focus (rail + panels hidden, top bar kept) · Review (read-only, Comments default — see Reviews) · publishing (dialog) · placeholder-present (publish blocked) · + deep: placeholder block · snippet block (+snippet-updated notice) · find/replace active · convert confirm.

**Interactions.** Auto-save (no save action). `/` block menu · `/spec` token · `⌘F` find · `⌘\` Focus. Stale block: Outline ● → scroll+select → Properties shows "at gen v2 → current v3 (stale)" → structured auto-updates, prose flagged → Accept refreshed value or Regenerate block (diff preview → accept/reject). Undo/redo per discrete action (typing coalesced by pauses), not per keystroke.

**Edge cases.** Comment anchoring: on block delete → orphans (detached-comments section); on regenerate → re-anchors if block id persists, else orphans. Advisory-lock conflict: loser notified, overwritten changes preserved as recoverable snapshot. Publishing blocked while any placeholder remains (pointer to the missing brief fragment). Manual blank doc = bare canvas, empty Outline.

**Data/RSC.** Editor canvas is a **client** surface over the working copy; auto-save drains a local queue to server actions (block-level). Block tree stored as **TipTap (ProseMirror) JSON** (ADR-013) — the stored tree is the Zod schema, no converter; spec tokens are **atom inline nodes**, non-editable by construction. Tokens are `InlineSpecToken{field_id, field_version_id}` — never free text; values resolve from the spec DB and update automatically (the staleness mechanism). Preview/PDF use the shared `block-renderer`. Offline: editable, queue holds edits, block-level keep-mine/use-server on reconnect (architecture §5.6).

**a11y — critical.** The **document paper is a Light-mode island** — render it in DS Light mode (see `02` §11.5): `text/secondary`/`text/primary`/`text/link` resolve to light values; underline inline links in prose; spec-token chips stay Dark mode. Slash menu / token picker = trapped popovers with ↑/↓ + Enter + Esc, return focus to caret. Lock banner is advisory, not a trap.

**Figma.** Editor shell states live on the **`Documents · Editor` page `60:800`** — 3 sections (Editing surfaces 6 · Output & review 3 · System states 3), 12 frames incl. the base shell — and deep block editing on the **Editor — Deep** page `357:913` · section `365:1775` (11 frames: Slash menu · Spec token picker · Block gallery [token chips + safety/callout/code/accordion/wizard] · Spec Table props · Hotspot props · Preview-PDF · Snippet block · Find & replace · Convert confirm · Empty doc · Lock banner). Editor base frame `40:132`; paper `40:216`; Inspector `40:222`.

---

## E. Reviews — `/documents/reviews` + Review surface

**Overview.** Where documents move from draft to live under control. Two questions: for the team, "what's in review and who's blocking?"; for the individual, "what's waiting on my approval?" The per-document **Review surface** is the auditable read-only sign-off that regulated hardware docs require.

**Route & shell.** **Reviews** is a rail view in Documents (Library · **Reviews** · Templates · Archive) → `/documents/reviews`. Queue in content; Navigator = filters/saved views; no Inspector on the queue. Opening a doc → **Review surface** `/documents/{id}/review` (read-only sibling of the Editor): reviewer-status header (toolbar) · read-only canvas · **Comments-first Inspector**.

**Queue layout.** Header: "Reviews" + **Mine / All** scope toggle + count. **Grouped by relationship** (collapsible): Awaiting my approval · My documents in review · Changes requested · All in review (when scope = All). **Document row:** title + Document Type · state pill (Review / Approved / Changes requested) · **approval roster** (per-role avatars: ✓ approved · • commented · ○ pending · ✕ rejected) · owner · due date (overdue emphasis) · last activity. Navigator filters: by Document Type, approver, due-this-week, overdue, mine/all.

**Review surface layout.** Reviewer-status header (title + revision + state · per-role status row · owner: pull-back + override if blocked · approver: **Approve** · **Send Back** · brief message + due date) · read-only canvas (same render as Editor Preview; tokens as chips; comment anchors highlighted; text-range underlined) · Comments Inspector (threads: author · anchor · body · one-level replies · resolve · Show resolved · add comment anchored to selection · @mention) · **detached comments** section (orphaned anchors) below the body.

**Send-for-review brief screen** (`?dialog=send-for-review`). Advisory **pre-flight** (placeholder blocks · unresolved comments · stale blocks · orphaned tokens — non-blocking) → Reviewers (each required role + assignee; **vacant role blocks** submission) → Message → Due date → Send for review.

**State machine.** `Draft → Review → Approved → Published`, with `Review → Draft` (pull back / Send Back), `Approved → Review|Draft`, `Published → Draft` (Create Revision). **AND logic:** Approved only when the last required role approves; **one Send Back returns immediately and resets all approvals**.

**Components.** Read-only block canvas (reuses Editor Preview) · comment thread (shared with Editor) · **approval roster** (new: avatars + status) · pre-flight checklist (shared with Publish + New Document) · Status pill, Avatar, Button, Tab, Doc card / Table row, Text field, Date picker, Skeleton. (Reviews does **not** reuse the Dashboard section-diff modal — that's spec-change prose review, a different surface.)

**States.** Queue grouped (default) · queue All · queue filtered · queue empty · Review surface (approver / owner / reviewer comment-only) · Approved (locked) · send-for-review brief · pre-flight (issues) · Send Back modal (mandatory reason) · owner-override modal (mandatory reason) · changes-requested (Draft + persistent rejection banner — Editor surface) · detached comments · loading.

**Interactions.** `[`/`]` prev/next thread · `a` Approve · `Esc` close. **Approve / Send Back** only (unresolved comments = de-facto "request changes"). Send Back requires a reason → permanent audit + Draft banner + resets approvals. **Owner override** = confirm + mandatory reason, recorded distinctly ("Approved on behalf of…"), never a normal approval. Create Revision forks a new Draft from the snapshot (snapshot stays live), prompts carry-forward of unresolved comments.

**Edge cases.** Vacant required role blocks submission (admin prompt). Roster wraps/collapses to "+N" as roles grow. Comment threads are revision-scoped (each cycle clean). Open question for build: whether Approved/Published docs stay listed (with a filter) or drop off.

**Data/RSC.** Queue server-rendered from review state + `approval_records` (immutable/append-only). Approve/Send Back/override = server actions writing approval records + advancing state + dispatching notifications. Read-only canvas via `block-renderer`.

**a11y.** Roster status not color-only (use the ✓/•/○/✕ glyphs + labels). Send Back/override dialogs = `role="dialog"` + trap + Esc + restore + required-reason error tied via `aria-describedby`. Comment anchors keyboard-reachable.

**Figma.** Page `260:911` · section `269:1343` (6 frames: Queue · Review surface · Send for review · Send back · Empty · Loading). Review surface canvas `260:944` (light paper toned to `#FAFAF8` + subtle border).

→ Continue to `04-screens-part-2-supporting.md`.
