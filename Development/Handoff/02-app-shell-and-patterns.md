# Arther Handoff · 02 — App Shell & Cross-Cutting Patterns

**Source file:** Arther — Screens · Figma key `pdMPtD58F3MeLrTzWsoX3E`
**IA sources:** `Design/IA/Feature IA/arther-app-shell-ia.md` (v0.3), `arther-app-ia.md` (v0.3), `arther-cross-cutting-ia.md`, `arther-system-error-ia.md`.
**Stack:** Next.js App Router, two deployments (authenticated app + public portal) in one monorepo — `Development/Architecture/arther-architecture.md` §3, ADR-002/003.
**Status:** the shell is the one set of components every screen slots into. Build it once.

This doc specifies the frame, the global overlays, the cross-screen patterns, motion, and the accessibility implementation spec. Per-screen detail is in docs 03–04.

---

## 1. The shell — 5 regions + top bar

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOP BAR (persistent) — ◧ Arther ▾ │ tab tab tab + │ ⌘K │ ⤓ ◷ ⚑ ◔ you │
├────┬───────────────┬─────────────────────────────────┬────────────────┤
│ ▦  │ NAVIGATOR     │  ┌ contextual toolbar ─────────┐ │  INSPECTOR     │
│ ▤  │ (left)        │  │                             │ │  (right)       │
│LOCAL│ organize:    │  │   CONTENT AREA              │ │  modify:       │
│RAIL│ outline/tree/ │  │   active surface/object     │ │  properties/   │
│icon│ list          │  └─────────────────────────────┘ │  config        │
├────┴───────────────┴─────────────────────────────────┴────────────────┘
  fixed   collapsible          scrolls                    collapsible
```

| # | Region | Role | Persistence | Maps to |
|---|---|---|---|---|
| 0 | **Top bar** | Identity · module switcher · universal tabs · ⌘K · utility cluster | Always | Root layout |
| 1 | **Local rail** (icon-only) | Switch views within the current mode | Fixed (not collapsible); absent on Dashboard & Settings | Per-mode layout |
| 2 | **Navigator** (left) | **Organize** content (outline/tree/list/sections) | Collapsible, conditional | Per-mode slot |
| 3 | **Content area** | The work + a **contextual toolbar** | Always (it is the work) | Page |
| 4 | **Inspector** (right) | **Modify** the selected thing (properties/config) | Collapsible, conditional | Per-mode slot |

**Two governing principles:** *left organizes, right modifies* (a region never does both); *the rail is the only fixed below-bar region* (sidebars come and go; the rail anchors). Only the **content area scrolls** — chrome never scrolls out of view. One Inspector context at a time (opening Comments replaces/slides over Properties, never a third column).

**Z-order (low→high):** content < sidebars/rail < top bar < slide-overs (notifications, comments) < modals < command palette < toasts. Never use `position: fixed` for these — manage a single overlay layer.

---

## 2. Modes & region matrix

Six modes. **The active tab determines the mode**, which sets the rail contents and which sidebars apply.

| Mode | Local rail (views) | Navigator | Inspector |
|---|---|---|---|
| **Dashboard** | — *(rail exception; optional Overview/Activity segmented control)* | — | — |
| **Specs** | Products · Component Library · Releases | ✓ tree/list | ✓ field Detail/History/Comments |
| **Documents · Library** | Library · **Reviews** · Templates · Archive | optional (saved views) | — |
| **Documents · Editor** | *(same Documents rail)* | ✓ Outline | ✓ Properties/Comments/History |
| **Snippets** | Snippets · Templates · Archived | ✓ list/folders | ✓ Usage + Lifecycle |
| **Portal** | Published · Domains · Access & Leads · Analytics | conditional | conditional |
| **Settings** | — *(rail exception; Navigator = section list)* | ✓ section list | — |

**Conditional-region rules:** Inspector appears only where you modify the object in front of you (Specs, Editor, Snippets, Portal). Navigator appears where there's content to organize. Both absent on Dashboard; Settings uses Navigator-as-section-list with no rail. Collapse state persists per mode/surface; Editor (Outline+Inspector) and Specs (tree+Inspector) pin open by default.

---

## 3. Universal tab system

- **What can be a tab:** any document (any sub-view), spec view (product/component/release), snippet, portal item, or mode home. Settings opens as a single tab.
- **Governing rule:** the active tab = the mode (single source of truth for "where am I"). Opening an object focuses an existing tab for it if present, else creates one.
- **Behavior:** tab = mode icon + object title + state indicator ("generating", "unpublished changes"). `+` opens a launcher (recents + search + new-object actions). Pinning supported. Overflow = horizontal scroll + menu (soft cap). Every tab ↔ a URL (§7); a deep link opens/focuses the matching tab.
- **Persistence:** tabs persist **per user + per workspace** (restored across sessions/devices); pinned tabs always restored.
- **Boundary:** the in-app tab strip is "open work"; the **browser stays a single page**. Pop-out windows are post-launch.

**Code note:** implement tabs as app state synced to the URL (not browser tabs). The active tab's object type selects the route segment and therefore the mode layout.

---

## 4. Shell states

| State | Behavior |
|---|---|
| Standard | Top bar + applicable rail/sidebars + content |
| Sidebars collapsed | Navigator/Inspector toggled away; content widens; remembered |
| **Focus mode** | Hides rail + both sidebars; **keeps the top bar** (tabs, ⌘K). For deep editing. `?focus=1` |
| **Full-canvas flow** | New Document · Import · Re-import review · onboarding — top bar persists (or slim), rail/sidebars suppressed, flow owns the canvas; **exit returns to the prior tab** |
| Empty | Per-mode first-run content in the content area |
| Loading | Chrome renders first; regions show skeletons |
| Overlay layer | Modals, slide-overs, palette, toasts — above chrome, never reflow it |

---

## 5. Responsive behavior

Desktop-first; the authoring app is **desktop-only** (the editor's hard minimum ≈1024px). The **public portal is the only mobile-facing surface** (doc 04).

| Breakpoint | Behavior |
|---|---|
| **≥1280px** | Full shell; the comfortable target |
| **1024–1280px** | Inspector → toggle/overlay; Navigator stays collapsible |
| **<1024px (tablet)** | Rail collapses into a top-bar menu; sidebars become overlays; content full-width; editing discouraged |
| **Mobile** | App shows a graceful "open on a larger screen to edit" state; portal is the mobile surface |

---

## 6. Keyboard & command model

| Action | Shortcut |
|---|---|
| Command palette / search | `⌘K` |
| Ask Arther (assistant) | `⌘J` |
| Switch module 1–6 | `⌘1`…`⌘6` |
| Next / prev tab | `⌃Tab` / `⌃⇧Tab` |
| Close tab | `⌘W` |
| Focus mode | `⌘\` |
| Toggle Navigator / Inspector | `⌥⌘\` / `⌥⌘⇧\` *(tbc)* |
| Editor: slash menu · token picker · find | `/` · `/spec` · `⌘F` |
| Auto-save everywhere | (no save shortcut) |

---

## 7. URL & deep-link strategy

- **Pattern:** `/{module}/{object-type}/{id}/{sub-view?}` — one app page, in-app tabs, each tab ↔ a URL.
  - `/dashboard` · `/specs/product/{id}` · `/documents/{id}/edit` · `/documents/reviews` · `/snippets/{id}` · `/portal/published` · `/settings/members`
- **Sub-views/panels = query params:** `?block={id}&panel=properties|comments|history`, `?tab=fields|brief|variants|coverage`, `?dialog=publish`, `?focus=1`, `?status=in_review&sort=updated`, `?q=…`.
- **Full-canvas flows** are app states that return to the prior tab on exit.
- **Reserve `/{workspaceSlug}/…`** now (multi-workspace is deferred) to avoid a later migration.
- **Public portal = separate domain** (`{workspace}.arther.io` / custom) with its own SSR URL model — outside the app shell.

### 7.1 Next.js App Router mapping (recommended)
- **Two apps, one monorepo** (ADR-003): `app/` (authenticated) and `portal/` (public SSR) sharing `ui`, `block-renderer`, `types`, `db`.
- **Authenticated app:** a root layout (top bar + overlay layer + providers) → per-module layout (rail + conditional Navigator/Inspector slots) → page. Modes = route segments; the active tab drives which segment is mounted.
- **RSC vs client:** server components for data-bearing reads (spec grid, library lists, published tables, analytics) under RLS with the user JWT; client components for the interactive shells (editor canvas, tab strip, command palette, assistant panel, drag/select, inspectors). Mutations via **server actions** validated with Zod; long ops (generate, publish, import, propagate) enqueue **Trigger.dev** tasks and stream status via **Supabase Realtime** (architecture §5, §8).
- **Portal app:** SSR from `published_snapshots` only; ISR/tag-revalidation on publish; renders the customer Brand Profile, not this DS.

---

## 8. Cross-cutting overlays (carried by the shell, no mode of their own)

Three distinct surfaces, three triggers — **never merged**. All are overlay states (not routes); optional deep-link params `?assistant=1`, `?palette=1`, `?notifications=1`.

| Surface | Trigger | Form | Job |
|---|---|---|---|
| **Command palette** | `⌘K` / top-bar search | Centered modal over scrim | "Take me there / run this" — deterministic, **no AI**. Groups: Jump to · Actions · Recent. ↑/↓ + ↵, Esc. |
| **Ask Arther** (assistant) | Help icon / `⌘J` | ~380×520 right slide-in panel | "Answer / figure out / do for me" — read **+ write**, **progressive-batch confirmation**. No floating character (avatar in panel header). Owns spotlight. |
| **Notifications** | Bell | Right slide-over | "What happened that I should see" — the **single delivery channel** for staleness/reviews/comments/mentions/snippet updates/sync. Grouped, newest-first, mark-all-read, deep-links to source. |
| **Spotlight** | (the assistant) | Dim scrim + ring + label | Assistant points at a UI element; auto-dismiss / Esc. |
| **Connectivity** | — | Utility-cluster chip | Connected · Saving… · Offline; drives editor offline behavior. |

**Assistant action model:** reads/navigations run immediately; **all writes batch into one confirmation card** (line items) → Confirm/Cancel the batch, run through `canDo`. Context-aware (current module/view/selection/role); session-only memory, per-tab. **Never navigates or mutates silently** — palette/notifications hand off; assistant confirms writes; spotlight only highlights.

**Boundary to respect in code:** the **Dashboard is the work queue**; notifications are the *feed that routes into it*. Don't duplicate items between them.

---

## 9. Cross-screen patterns (build once, reuse)

| Pattern | Where it fires | Spec |
|---|---|---|
| **Pre-flight checklist** | Send-for-review **and** Publish **and** New Document generate | Same check family, multiple triggers. **Blocking** (placeholder blocks, broken refs, vacant approval role) vs **advisory** (stale blocks, missing alt text, word-count — must acknowledge → logged). |
| **Archive-instead-of-delete dialog** | Any delete-with-dependents (products, components, fields, doc types, brand profiles, snippets) | "Can't delete {entity}" + **list of blocking dependents** + **Archive instead** (primary) / Cancel. Hard delete only unlocks at zero references. This is the visible face of invariant 7 — see §10 below + error doc. |
| **Empty states** | Every mode first-run | Description + **primary + secondary/ghost** CTA (standardized) + one-time assistant nudge. |
| **Loading** | Every surface | Chrome first, then skeletons. |
| **Optimistic-lock banner** | Editor (doc open by another user) | Advisory: "Jane has this open" → Open read-only / Edit anyway; loser's changes preserved as a recoverable snapshot (never silently lost). |
| **Two-speed update** | Spec change → documents | Structured tokens/tables auto-update working copies; **prose is flagged** for human review (routes to Dashboard). Portal snapshots untouched until republish. |

---

## 10. Motion

The system is restrained — no decorative animation. Specify:

| Element | Trigger | Motion | Duration | Easing |
|---|---|---|---|---|
| Slide-overs (notifications, comments) | open/close | translateX from edge | 180–220ms | ease-out / ease-in |
| Command palette / modals | open | fade + 4–8px rise | 120–160ms | ease-out |
| Assistant panel | toggle | translateX | 200ms | ease-out |
| Spotlight | assistant trigger | scrim fade + ring pulse once | 200ms | ease-out |
| Tab open/close | user | width + fade | 120ms | ease |
| Inspector/Navigator collapse | toggle | width | 160ms | ease-in-out |
| Generation stream | per section | row state swap + live preview append | per-section | — |
| Toasts | event | rise + fade | 150ms in / 200ms out | ease |

Respect `prefers-reduced-motion`: replace translate/scale with instant or opacity-only.

---

## 11. Accessibility implementation spec (file-wide)

The DS supplies the visuals (focus ring, ≥24px hit areas, AA tokens); these are the **code-level** requirements from `Design/arther-screens-accessibility-audit.md`. They apply to every screen.

### 11.1 Focus (2.4.7)
Wire `:focus-visible` to a 2px `border/focus` ring on **all** interactive elements (the DS Focus variants are the spec). Ensure top-bar icon hit areas and custom controls are reachable and show the ring.

### 11.2 Name / role / value (4.1.2)

| Element | Requirement |
|---|---|
| Icon-only buttons (search, bell, help, avatar, close, chevrons) | `aria-label` with the action name |
| Tabs (Spec / Editor / Dashboard / Inspector) | `role="tablist"`/`"tab"` + `aria-selected` |
| Toggles | `role="switch"` + `aria-checked` |
| Dialogs/overlays (Review modal, Publish, Delete-blocked, Command palette, Notifications) | `role="dialog"` + `aria-modal` + `aria-labelledby`, **focus trap**, **Esc to close**, **focus restored to trigger** |
| Status pills | text label present (already not color-only) |

### 11.3 Keyboard & focus order (2.1.1, 2.4.3)

| Surface | Tab/focus | Enter/Space | Escape | Arrows |
|---|---|---|---|---|
| Command palette | trap; first result focused | activate result | close, restore | ↑/↓ results |
| Slash menu / Spec-token picker | trap in popover | insert selection | close, return to caret | ↑/↓ (+ groups) |
| Review modal / Publish / Delete-blocked | trap in dialog | default action | close, restore to trigger | n/a |
| Notifications slide-over | trap while open | activate item | close, restore | ↑/↓ list |
| Tabs | Tab to active tab only | activate | n/a | ←/→ between tabs |

### 11.4 Forms (1.3.1, 3.3.1/2)
Persistent visible `<label for>` on every field (placeholders are examples only); inline error text tied via `aria-describedby`; never signal error by color alone; `scope` headers on the Spec table.

### 11.5 Light-paper island (1.4.3) — critical
The editor **document canvas** is light "paper" inside the dark app. Render it in the DS **Light mode** so `text/secondary` (→ light), `text/primary`, and `text/link` (`#1A66C9`, 4.9:1) resolve correctly; underline inline links in running prose (1.4.1). Keep spec-token chips in Dark mode (intentional pop). Same rule for the two light warn banners (Editor stale alert, Snippets stale-at-source).

### 11.6 Target size (2.5.8)
Keep the ≥24×24 hit-area floor for every icon-only control; top-bar utilities + avatar reach toward 44px.

### 11.7 Near-threshold pairs
`text/tertiary` clears AA on all six dark surfaces (tightest pair: `bg/inset`, 4.56:1); the three portal pairs sit ~4.51–4.55:1. All pass but are fragile — if anti-aliasing/palette ever shifts, nudge one step.

---

## 12. Figma walkthrough — shell & overlays

Screens file `pdMPtD58F3MeLrTzWsoX3E`:

| What | Page / node |
|---|---|
| App-shell mockups (Modes / States & flows / Overlays) | the **App Shells** page `0:1` — 15 frames in 3 sections (7 + 5 + 3) |
| Cross-cutting overlays (Ask Arther / Command palette / Notifications / Spotlight / Connectivity) | page `314:911` · section `321:1307` (5 frames) |

> Known reference-page drift (from the design critique): the **App Shells** reference page shows the Button's default leading "+" on 8 buttons where a plus is semantically wrong (Back/Cancel/Publish/View portal/Save). The shipped per-surface pages hide it correctly — follow the per-surface pages, not the shell reference, for button icon usage.

→ Continue to `03-screens-part-1-core.md` (Dashboard, Specs, New Document, Editor, Reviews) and `04-screens-part-2-supporting.md`.
