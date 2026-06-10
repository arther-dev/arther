# Arther — App Shell: Information Architecture

**Version:** 0.3
**Date:** 3 June 2026 (rev. 5 Jun 2026)
**Status:** Shell IA — defines the global frame. Per-page IA for each mode is a follow-up pass.
**Supersedes:** the navigation model in the May 2026 IA pass (persistent left-sidebar nav). See §3.
**v0.2 (4 Jun 2026):** the Documents rail gains a **Reviews** view (Library · Reviews · Templates · Archive) — a workspace review/approval queue. This refines §6's "Review is not a rail item" note: per-document Edit/Review *switching* still lives in the contextual toolbar, but the workspace **Reviews queue** is a mode-level rail view. See `arther-app-ia.md` §11 Decision 12.

---

## 1. Purpose & Scope

This document defines the **structural skeleton of the Arther application as a whole** — the persistent chrome and the system of regions that every screen lives inside — before any individual page is designed. It answers: what frame does the app live in, where does navigation live, how do the four product surfaces coexist in one shell, and what rules govern the regions that change from mode to mode.

**In scope:** the global top bar, the navigation model, the universal tab system, the four below-bar regions and their behavior, the inventory of modes and how each plugs into the frame, shell states, responsive behavior, the keyboard/command model, naming conventions, component reuse, and a shell-level URL strategy.

**Out of scope (deferred to per-mode page IA):** the detailed content hierarchy of any individual page, feature-level user flows, the public portal's visitor-facing IA, and all visual/design-system decisions. Where a shell rule has page-level consequences, it is noted and parked.

---

## 2. The Problem the Shell Solves

Arther is four products in one frame: a **spec database**, an **AI-assisted document editor**, a **versioning/release system**, and a **publishing portal**. Each has genuinely different interaction needs — the spec DB wants three data panels, the editor wants an outline plus a properties inspector, the library wants a browse grid, the portal wants configuration forms.

The old model — a single persistent left-sidebar nav — spent fixed horizontal space on a mostly-static element and forced every one of those surfaces to fit the leftover width. The shell described here replaces that with a **layered region system**: a thin global bar carries everything that is true everywhere (identity, navigation, search, open work, account), and everything below it is a set of well-defined regions that appear, disappear, and re-populate according to the active mode. The frame is constant; the contents flex.

---

## 3. Locked Decisions (and reconciliation with the prior IA)

| Decision | Resolution |
|---|---|
| **Navigation layering** | **Global module switcher in the top bar + a far-left local rail for within-mode views** (option A). The persistent rail serves the frequent action — switching views inside the mode a user lives in — and never collapses. The module switcher (infrequent, cross-product hops) is a top-bar dropdown, backed by the command palette so power users switch modules by typing. |
| **Tab model** | **Universal tabs.** Any primary object — a document, a spec view, a snippet, a portal item, a mode home — can be open as a tab in the persistent top bar. **The active tab determines the current mode**, which in turn determines the local rail's contents and which sidebars apply. |
| **Theme** | Dark mode (project standard). |
| **This pass's scope** | App shell only. |

**Reconciliation with the May 2026 IA pass:**

- **Dashboard as the default landing surface** — retained.
- **Snippets as a top-level destination** — retained (it is one of the six modes).
- **Spec DB "collapse nav to icons"** — **superseded / now moot.** The whole app uses an icon-only local rail; there is no full-width nav to collapse. The spec DB's old three-panel layout maps cleanly onto rail + left sidebar + content + right sidebar (see §6).
- **Editor "full-screen takeover with a back arrow"** — **superseded.** The editor now lives under the persistent top bar like every other mode. The focus benefit it was reaching for is provided by an explicit **Focus mode** (§9) that hides the rail and sidebars on demand.
- **New Document wizard as a full-page flow** — retained, and generalized into the shell's **full-canvas flow** state (§9).

---

## 4. Shell Anatomy

Five regions, plus the persistent top bar.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOP BAR  — persistent on every mode                                          │
│  ◧ Arther ▾ │  ▭ tab  ▭ tab  ▭ tab  +      ⌘K search      │  ⤓  ◷  ⚑  ◔ you   │
│  └ module      └ universal tab strip  ·  command palette    └ utility cluster  │
│    switcher                                                                    │
├──────┬──────────────────┬───────────────────────────────────┬─────────────────┤
│      │                  │   ┌── contextual toolbar ───────┐  │                 │
│  ▦   │  LEFT SIDEBAR    │   │                             │  │  RIGHT SIDEBAR  │
│  ▤   │  "Navigator"     │   │                             │  │  "Inspector"    │
│  ▥   │                  │   │      CONTENT AREA           │  │                 │
│  ▤   │  organize the    │   │   the active surface /      │  │  modify the     │
│  ▦   │  content:        │   │   object                    │  │  thing in front │
│      │  outline / tree  │   │                             │  │  of you:        │
│ LOCAL│  / list          │   │                             │  │  properties /   │
│ RAIL │                  │   └─────────────────────────────┘  │  config         │
│ icon │  collapsible,    │                                    │  collapsible,   │
│ only │  conditional     │   scrolls independently            │  conditional    │
├──────┴──────────────────┴───────────────────────────────────┴─────────────────┤
│  fixed         collapsible              scrolls                  collapsible    │
└────────────────────────────────────────────────────────────────────────────────┘
```

| # | Region | Role | Persistence |
|---|---|---|---|
| 0 | **Top bar** | Identity, global navigation, open work, search, utilities | Always present, every mode |
| 1 | **Local rail** (far-left, icon-only) | Switch between **views within the current mode** | Fixed; present in most modes (see §6 exceptions) |
| 2 | **Left sidebar — "Navigator"** | **Organize** the content on screen: outline, component tree, list, folders | Collapsible; conditional per mode |
| 3 | **Content area** | The active surface/object + a **contextual toolbar** of surface-specific actions | Always present (it is the work) |
| 4 | **Right sidebar — "Inspector"** | **Modify** the thing in front of you: properties, configuration | Collapsible; conditional per mode |

The two governing principles:

- **Left organizes, right modifies.** The Navigator answers "what's in here and where am I"; the Inspector answers "what are the settings of the selected thing." A region never does both jobs.
- **The rail is the only fixed below-bar region.** Sidebars come and go; the rail is the stable spatial anchor, so its position never moves even as its icons change with the mode.

---

## 5. Navigation Model

Three layers of navigation, deliberately separated by frequency and scope.

### 5.1 Module switcher (top-left dropdown) — cross-product, infrequent

Opens the six **modes**. Selecting a module focuses that module's existing tab if one is open, otherwise opens the module's home as a new tab. The current module's name is always shown next to the brand, so the user's global location is legible without opening the menu. Backed by the command palette and `⌘1…6`, so the dropdown is never the only path.

- **Primary modules (6):** Dashboard · Specs · Documents · Snippets · Portal · Settings.
- Maximum top-level items: 6. New top-level destinations are added only by deliberate decision — the bar's value is its stability.

### 5.2 Local rail (far-left, icon-only) — within-mode, frequent

Switches between the **views** of the current mode (e.g. in Specs: Products / Component Library / Releases). Icon-only with label-on-hover; the active view is marked with an accent bar. Because the active tab sets the mode, **the rail re-populates when you switch to a tab in a different mode** — the rail is always "the current mode's views," not a fixed surface. Two modes bend this rule (§6).

### 5.3 Universal tabs (top-bar center) — open work, persistent

The set of things the user currently has open, across all modes. Detailed in §7. Tabs are the primary way users move between open objects; the module switcher and rail are for reaching things not yet open.

### 5.4 Command palette & search (top-bar center)

`⌘K` opens a single surface that jumps to modules, opens objects by name, and runs actions ("New document", "Publish", "Create release"). Global search lives here too. This is the power-user spine that keeps the module dropdown optional.

### 5.5 Utility cluster (top-right)

Outside the content hierarchy: **notifications** (the unified notification system — review requests, staleness alerts, comment mentions), **help**, **workspace switcher** (slot reserved; multi-workspace is an Enterprise/deferred concern), and **account**.

---

## 6. Mode Map & Region Matrix

The six modes, their provisional local-rail views, and which below-bar regions each uses. (Exact rail inventories are confirmed in each mode's page-IA pass; views below are the working set.)

| Mode | Local rail (views) | Navigator (left) | Inspector (right) |
|---|---|---|---|
| **Dashboard** | — *(single surface; optional top segmented control: Overview / Activity)* | — | — |
| **Specs** | Products · Component Library · Releases | ✓ component tree / list for the selected view | ✓ field detail + version/comment history |
| **Documents · Library** | Library · Reviews · Templates · Archive | optional (saved views / filters) | — |
| **Documents · Editor** | *(same Documents rail)* | ✓ document outline | ✓ block / document properties |
| **Snippets** | Snippets · Block Library | ✓ list / folders | ✓ usage + properties |
| **Portal** | Published · Branding · Domains · Access & Leads · Analytics | conditional (list of items in the view) | conditional (config for the selection) |
| **Settings** | — *(uses the Navigator as a section list; no icon rail)* | ✓ settings sections | — |

**Two deliberate exceptions to "every mode has a rail":**

- **Dashboard** is a single destination, not a set of views. Forcing a rail would invent views that don't exist. If Overview/Activity warrants a split, it's a segmented control on the content, not a rail.
- **Settings** has many text-heavy sections that read better as a labeled list than as a row of ambiguous icons, so Settings uses the Navigator (left sidebar) as its section list and omits the icon rail.

**Object sub-views live in the contextual toolbar, not the rail.** A document's Edit / Preview / Comments / History switch belongs to the document surface (contextual toolbar in the content area), not the Documents rail. The rail is mode-level; per-object view switching is surface-level — so the **Editor** is a surface (not a rail item) and a single document's **Edit ⇄ Review** switch stays in its toolbar. The workspace **Reviews queue** (the list of all documents in the approval pipeline), however, *is* a mode-level destination and so **is** a rail view alongside Library (added v0.2); the per-document Review surface is the drill-in from it.

### 6.1 Conditional-region rules

- **Inspector (right) appears only on surfaces where you modify the object in front of you:** Specs (field detail), Editor (block/doc properties), Snippets (snippet properties), Portal (item config). It is **absent** on Dashboard, Documents Library, and Settings.
- **Navigator (left) appears when the surface has content to organize or navigate** (outline, tree, list, folders, sections). It is **absent** on Dashboard.
- Both sidebars are independently collapsible; collapse state is remembered per mode/surface.

### 6.2 Cross-cutting concerns (no mode of their own)

Some features in the product spec are cross-cutting and intentionally do **not** get a dedicated mode — the shell carries them:

- **Smart Spec Tracking** surfaces as: action items on the **Dashboard**, `[!]` badges in **Specs**, staleness dots in the **Editor** outline + detail in the **Inspector**, and alerts in the **notifications** cluster. No "Staleness" mode.
- **Collaboration & Review** lives in **Documents**: a **Reviews** rail view (the workspace review/approval queue, added v0.2) plus the per-document **Review surface** (a read-only state of a document tab), with comments in the Inspector or a slide-over and routing via **notifications**.
- **Product Variants** live inside **Specs** (variant switcher) and the **Editor** (variant-aware blocks); the public comparison view is a portal concern. No new mode.
- **External Sync** lives in **Settings → Integrations**, with the import experience running as a **full-canvas flow** (§9).

This is the shell-level verification that all four products plus the supporting features have a home — see §16.

---

## 7. The Tab System (universal)

### 7.1 What can be a tab

Any primary object or surface: a **document** (in any of its sub-views), a **spec view** (a product, a component, or a release), a **snippet**, a **portal item**, or a **mode home** (Dashboard, a Library). Settings is a single utility destination and opens as a single tab rather than spawning many.

### 7.2 The governing rule

**The active tab determines the mode.** Selecting a tab whose object belongs to Specs puts the app in Specs mode, re-populates the local rail with Specs views, and applies the Specs sidebars. This is what makes universal tabs coherent rather than chaotic: there is always exactly one source of truth for "where am I" — the active tab.

### 7.3 Behavior

| Aspect | Behavior |
|---|---|
| Tab identity | Mode icon + object title + state indicator (e.g. "generating", "unpublished changes"). The editor auto-saves, so a classic "unsaved dot" is rare. |
| Open | From the rail, Navigator, search/command palette, or a link. Opening focuses an existing tab for that object if present, else creates one. |
| New tab (`+`) | Opens a launcher: recents, search, and "new object" actions. |
| Close | Standard; closing the active tab focuses its neighbor. |
| Pinning | Supported — e.g. pin a reference spec while drafting several documents. |
| Overflow | Horizontal scroll + an overflow menu. Soft cap, not a hard limit (see §15). |
| Deep-linking | Every tab maps to a URL (§14); a link opens or focuses the corresponding tab. |

### 7.4 Recommended boundary

The in-app tab strip is the unit of "open work"; the **browser stays a single page**. The app manages its own tabs (each addressable by URL) rather than spreading across browser tabs — this keeps tab state, pinning, and the active-tab→mode rule under app control. Pop-out-to-window is deferred post-launch (§17).

---

## 8. Region Behavior & Rules

- **Scroll model.** The top bar, local rail, and the sidebars are fixed; **only the content area scrolls** (plus independent internal scroll within a sidebar when its list is long). Chrome never scrolls out of view.
- **Collapse.** Navigator and Inspector each have a persistent collapse toggle; the rail does not collapse (it is already minimal). Collapse states persist per mode/surface.
- **Z-order (low → high):** content < sidebars/rail < top bar < slide-over panels (notifications, comments) < modals < command palette < toasts.
- **One inspector at a time.** A surface shows a single right-sidebar context; opening a different panel (e.g. comments) replaces or slides over it rather than stacking a third column.
- **Resize.** Sidebars are width-resizable within min/max bounds; the content area takes the remainder. (Exact bounds are a page-IA detail.)

---

## 9. Shell States

| State | Description |
|---|---|
| **Standard** | Top bar + applicable rail/sidebars + content. |
| **Sidebars collapsed** | Navigator and/or Inspector toggled away; content widens. Remembered. |
| **Focus mode** | Hides the rail and both sidebars; keeps the top bar (so tabs and search remain). For deep editing. Replaces the old full-screen editor takeover. (Focus keeps the top bar — §17.) |
| **Full-canvas flow** | For multi-step flows that deserve the full width: **New Document wizard**, **onboarding / spec import**, **re-import review**. The top bar persists (or a slim variant); rail and sidebars are suppressed; the flow owns the canvas. Exiting returns to the prior tab. |
| **Empty** | Per-mode first-run states (no products, no documents yet) shown in the content area. |
| **Loading** | Chrome renders first; regions show skeletons. |
| **Overlay layer** | Modals, slide-overs (notifications, comments), command palette, toasts — above the chrome, never reflowing it. |

---

## 10. Responsive Behavior

Desktop-first; the authoring app targets large screens and the editor is explicitly desktop-only per the product spec.

| Breakpoint | Behavior |
|---|---|
| **≥ 1280px** | Full shell; all regions comfortable. The editor's comfortable target. |
| **1024–1280px** | Inspector becomes a toggle/overlay rather than a persistent column; Navigator stays collapsible. |
| **< 1024px (tablet)** | Local rail collapses into a top-bar menu; both sidebars become overlays; content goes full-width. Editing is discouraged. |
| **Mobile** | The app shell is not a target. The **public portal** (separate domain, out of scope here) is the mobile-facing surface. Show a graceful "open on a larger screen to edit" state. |

Exact pixel values are provisional and finalized with the design system.

---

## 11. Keyboard & Command Model (provisional)

| Action | Shortcut |
|---|---|
| Command palette / search | `⌘K` |
| Switch module 1–6 | `⌘1` … `⌘6` |
| Next / previous tab | `⌃Tab` / `⌃⇧Tab` |
| Close tab | `⌘W` |
| Focus mode | `⌘\` |
| Toggle Navigator (left) | `⌥⌘\` *(tbc)* |
| Toggle Inspector (right) | `⌥⌘⇧\` *(tbc)* |

---

## 12. Naming Conventions

One word per concept, used everywhere.

| Concept | Canonical name | Notes |
|---|---|---|
| Global bar | **Top bar** | Not "header", not "nav bar". |
| The six destinations | **Modules** (internal) | Users see the names (Dashboard, Specs…), not the word "module". |
| Top-left dropdown | **Module switcher** | — |
| A destination within a module | **View** | What the local rail switches between. |
| An open object in the content area | **Surface** | What a tab points at. |
| Far-left icon nav | **Local rail** (or just **rail**) | Icon-only; mode-scoped. |
| Left sidebar | **Navigator** | Organizes content; per-mode label may differ (Outline, Components). |
| Right sidebar | **Inspector** | Modifies the selected object's properties/config. |
| Center work region | **Content area** | "Canvas" is reserved for the editor specifically. |
| Per-surface action bar | **Contextual toolbar** | Lives at the top of the content area. |
| Open-work strip | **Tabs / tab strip** | Universal. |
| Search + actions | **Command palette** | — |

---

## 13. Component Reuse Map

| Shell component | Used on | Variation |
|---|---|---|
| App frame / chrome | All modes | Invariant |
| Top bar (incl. module switcher, tab strip, command palette, utility cluster) | All modes | Invariant structure; tab contents vary |
| Local rail | All except Dashboard, Settings | Icon set varies by mode |
| Navigator (left sidebar) | Specs, Documents·Editor, Snippets, Portal (cond.), Settings | Contents vary; collapsible |
| Inspector (right sidebar) | Specs, Editor, Snippets, Portal (cond.) | Contents vary; collapsible |
| Contextual toolbar | Every content surface | Actions vary per surface |
| Tab | Universal | Icon + title + state |
| Slide-over panel | Notifications, comments | Content varies |

The win: the entire frame (top bar, rail shell, sidebar shells, tab strip, toolbar shell) is **one set of components** built once. Each mode supplies contents into known slots rather than constructing its own layout.

---

## 14. URL & Deep-Link Strategy (shell-level)

- **Pattern:** `/{module}/{object-type}/{id}/{sub-view?}`
  - `/dashboard`
  - `/specs/product/{productId}` · `/specs/component/{componentId}` · `/specs/release/{releaseId}`
  - `/documents` (library) · `/documents/{docId}/edit` · `/documents/{docId}/review`
  - `/snippets/{snippetId}`
  - `/portal/branding` · `/portal/domains` · `/portal/access`
  - `/settings/members`
- **Tabs ↔ URL:** the active tab's object determines the URL; switching tabs updates it; a deep link opens or focuses the matching tab.
- **Workspace prefix reserved:** `/{workspaceSlug}/…` for future multi-workspace (Enterprise/deferred) — reserve the slot now to avoid a later migration.
- **Query params** for list/library state: `?status=in_review&sort=updated`, search `?q=…`.
- **Public portal is a separate domain** (`company.arther.io` / custom) with its own visitor IA — explicitly outside this app shell.

---

## 15. Scaling & Growth

- **Tabs** grow with usage → horizontal scroll + overflow menu + pinning; a soft cap with a "too many tabs" affordance rather than a hard limit.
- **Local rail** items per mode are intentionally few (3–5). If a mode's views exceed ~6, that is a signal to reconsider the mode's structure, not to grow the rail.
- **Modules** are capped at 6 by design; new product areas should map into an existing module before a seventh is considered.
- **Navigator lists** (products, documents, snippets) grow indefinitely → search/filter within the Navigator, not longer rails.

---

## 16. Verification — does every product surface have a home?

| Feature bucket | Home in the shell |
|---|---|
| 1. Spec Database | **Specs** mode (rail = Products/Library/Releases; Navigator = tree; content = field list; Inspector = field detail + history) |
| 2. AI Document Generator | **Full-canvas flow** (New Document wizard) → drops into Documents·Editor |
| 3. Visual Block Editor | **Documents · Editor** (Navigator = outline; content = block canvas + contextual toolbar; Inspector = properties) |
| 4. Smart Spec Tracking | Cross-cutting: Dashboard action items + Specs badges + Editor indicators + notifications |
| 5. Publishing Portal & Export | **Portal** mode (management). Public visitor site = separate domain, out of scope |
| 6. Collaboration & Review | **Documents → Reviews** rail queue + per-document Review surface + comments panel + notifications |
| 7. Content Reuse | **Snippets** mode (Snippets + Block Library) |
| 8. Product Variants | Inside **Specs** + **Editor**; comparison view is a portal concern |
| 9. External Sync | **Settings → Integrations** + import as a full-canvas flow |
| 10. Enterprise | **Settings** (members, roles, audit) — deferred |

No feature is orphaned by the shell, and no feature requires a seventh module. The two cross-cutting systems (staleness, review/notifications) are carried by the Dashboard, per-surface indicators, and the utility cluster rather than by dedicated modes.

---

## 17. Resolved Decisions (shell-level)

*Resolved 5 Jun 2026 (was: open questions).*

1. **Tab persistence** — open tabs persist **per user + per workspace** (you return to your working set across sessions and devices); pinned tabs are always restored; soft cap with a "too many tabs" overflow affordance.
2. **Focus mode depth** — Focus hides the rail + both sidebars but **keeps the top bar** (tabs, search, ⌘K stay). A true full-screen "present" mode is a post-launch extra, not the default.
3. **Dashboard** — a single surface with an **optional Overview / Activity segmented control** at the top; **no icon rail**.
4. **Settings nav** — **Navigator-as-section-list**, no icon rail. Confirmed.
5. **Global "create" actions** — **all three, with the tab `+` launcher as the spine**: `+` opens recents + new-object actions; the **command palette** runs the same actions for power users; **per-mode primary buttons** (New Product in Specs, New Document in Documents) give in-context entry.
6. **Pop-out windows** — **not at v1**; the tab↔URL model keeps multi-monitor pop-out feasible post-launch.
7. **Module switcher** — **modules only** (the six). Recents/pinned objects live in the `+` launcher and command palette, keeping the switcher stable.
8. **Notifications** — **slide-over** from the utility cluster. The Dashboard carries actionable items, so no separate full-page notification surface at v1.
9. **Breakpoints** — full shell **≥ 1280px**; Inspector becomes an overlay **1024–1280**; **< 1024 (tablet)** the rail collapses into a top-bar menu and sidebars become overlays (editing discouraged); **editor hard minimum ≈ 1024px**, below which it shows "open on a larger screen." Exact values finalized with the design system.
10. **Pinned-open sidebars** — **confirmed.** A per-mode "pinned open" option: the **Editor** (Outline + Inspector) and **Specs** (component tree + Inspector) pin open by default and are collapsible on demand; other modes default to collapsible. No revisiting of the Editor/Spec-DB feature decisions required.

---

## 18. Out of Scope (this pass)

Per-mode page IA and content hierarchy; feature-level user flows; the public portal's visitor-facing IA; detailed responsive specs; and all visual / design-system work. Each mode gets its own page-IA pass that fills the regions this shell defines.
