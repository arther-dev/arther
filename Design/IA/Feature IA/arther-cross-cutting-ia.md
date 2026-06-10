# Information Architecture: Arther — Cross-Cutting Layer

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **cross-cutting layer** — the surfaces carried by the **shell** on every mode: **Ask Arther** (assistant), the **⌘K command palette**, the **notifications** slide-over, the **spotlight** overlay, and the **connectivity** indicator. Extends `arther-app-shell-ia.md` (§5.4) and `arther-app-ia.md` (§5); realizes Ask Arther (v1.1), Collaboration & Review §9 (unified notifications), and Onboarding (spotlight).
**Decisions this pass (boundaries already resolved in app-ia v0.2 — no fork):** (1) **Ask Arther** opens from the **top-bar Help icon** (or **⌘J**) as a **right slide-in panel**, read **+ write** with **progressive-batch confirmation**, **no floating character** (avatar lives in the panel header); (2) the **⌘K command palette** owns `⌘K` (jump / search / run); (3) **notifications** are a **right slide-over** from the bell (the single delivery channel for every feature); (4) **spotlight** is owned by Ask Arther (dim + ring + label); (5) the **connectivity** indicator (Connected / Saving / Offline) lives in the utility cluster. These three — assistant, palette, notifications — are **distinct surfaces with distinct triggers**, deliberately not merged.

**This is the layer that belongs to no single mode.** Each surface is owned by a feature spec; this IA defines how they **coexist in the top bar**, their **triggers and boundaries**, and their **on-screen anatomy** — not their backend (LLM, notification delivery, action schemas).

---

## 1. Purpose & Scope

Three systems sit above every mode and must not collide: the **assistant** you summon to ask or act, the **command palette** you summon to jump or run, and the **notifications** that come to you. The app-wide IA already drew their lines (⌘K = palette, ⌘J = assistant, bell = notifications, Help = assistant entry); this doc specifies each surface's anatomy and how the trio reads as one coherent top bar. It also covers the **spotlight** the assistant uses to point at the UI, and the **connectivity** state the editor depends on.

**In scope:** the **Ask Arther panel** (entry, anatomy, read/write action model, progressive-batch confirmation, suggested prompts, session memory, status, spotlight); the **⌘K command palette** (input, result groups, actions); the **notifications slide-over** (grouped events, mark-as-read, deep-links); the **spotlight overlay**; the **connectivity indicator**; their triggers/shortcuts, states, flows, naming, and component reuse.

**Out of scope (referenced at the boundary):** the assistant's **LLM/system-prompt/action schemas** (Ask Arther spec); **notification delivery + email + preferences** (Collaboration §9 + Settings → Notifications); the **action targets** themselves (each owning mode/IA — e.g. the assistant "create a spec" lands in Specs); per-mode **empty states** (each mode's IA); the **Dashboard** action queue (separate — notifications *route* to work, the Dashboard *is* the work queue); and all visual / design-system work.

---

## 2. Where the Layer Sits (shell recap)

Everything here is carried by the **top bar**, present on every mode:
- **Top-bar center:** the **⌘K command palette / search** entry.
- **Top-bar utility cluster (right):** **search · bell (notifications) · Help (Ask Arther) · avatar**, plus a **connectivity** indicator.
- **Overlay layer (global):** the assistant **panel** (right slide-in), the **palette** (centered modal), the **notifications slide-over** (right), and **spotlight** (dim + ring) all render above the active mode without changing it.

The governing rule: **these surfaces never navigate or mutate silently** — the assistant confirms writes, the palette and notifications hand off to the owning surface, spotlight only highlights.

---

## 3. Surface & Trigger Map

- **Ask Arther** (assistant panel) — **Help icon** / **`⌘J`** → a **~380×520 right slide-in** chat panel
  - **First open** — greeting + **suggested prompts** (contextual to the current mode)
  - **Conversation** — messages + **read-result cards** (inline) + **write-confirmation card** (progressive batch)
  - **Working / Done / Error** — status reflected on the header avatar; errors in chat
  - **Spotlight** — when the assistant points at a UI element (dim + ring + label)
- **Command palette** — **`⌘K`** → a **centered modal** over a scrim
  - input → grouped results: **Jump to** (modules/objects) · **Actions** (run) · **Recent**
- **Notifications** — **bell** → a **right slide-over**
  - grouped events (newest first), **mark-as-read** (bulk), deep-links to the source; the **single channel** for staleness · reviews · comments · mentions · snippet updates · sync
- **Connectivity indicator** — utility cluster — **Connected · Saving… · Offline** (drives editor offline behaviour)
- **States:** assistant first-open · assistant working · assistant write-confirm · assistant error · palette (results) · palette (empty/no match) · notifications (grouped) · notifications (empty/all-read) · spotlight · connectivity (3 states) · Loading.

---

## 4. Invocation & Boundaries

- **Ask Arther:** click **Help** or press **`⌘J`** → panel toggles (Esc / click-outside / second press closes). **Passive** — never pops up unprompted; **no floating character**.
- **Command palette:** **`⌘K`** (or click the top-bar search) → centered modal; type to filter; `↑/↓` + `↵` to run; Esc closes.
- **Notifications:** click the **bell** → right slide-over; a badge shows unread count.
- **Boundary clarity:** **palette = "take me there / run this" (deterministic, no AI)**; **assistant = "answer / figure out / do for me" (AI, confirms writes)**; **notifications = "what happened that I should see"**. Same top bar, three distinct jobs — never merged.
- **Spotlight:** triggered *by the assistant* (e.g. "here's the publish button") — dims the app, rings the target, shows a label, auto-dismisses.
- **Mobile:** not a target (the authoring app is desktop-only).

---

## 5. Region Content Hierarchy

### Ask Arther panel (right slide-in, ~380×520)
1. **Header** — the **character avatar** (~48px, with a status icon: idle/searching/done) + "Ask Arther" + **close (×)**.
2. **Messages** — scrollable; **user** messages right-aligned/accent; **Arther** left-aligned/surface with a small avatar; streaming **typing indicator** while working.
3. **Read-result cards** — lookups render as **formatted cards inline** (a spec value, a document, a staleness explanation) — not raw data.
4. **Write-confirmation card** — when a request implies writes: reads/navigations run immediately; **all writes batch into one card** listing each as a line item, with **Confirm / Cancel** for the whole batch.
5. **Suggested prompts** — on first open, contextual chips ("What's stale in this doc?", "Create a datasheet for…").
6. **Input** — "Ask me anything…" (auto-expand to 4 lines; Enter sends, Shift+Enter newline).

### Command palette (centered modal)
1. **Search input** — `⌘K`, placeholder "Search or run a command…".
2. **Result groups** — **Jump to** (modules, recent products/documents/snippets) · **Actions** (New document, New product, Import, Publish…) · **Recent**. Keyboard-navigable; each row has an icon + label + (shortcut/scope).
3. **Empty / no match** — "No results — try…".

### Notifications slide-over (right)
1. **Header** — "Notifications" + **Mark all read**.
2. **Grouped list** — newest first; grouped to reduce noise (e.g. "3 comments on Servo X1"); each item: type icon · title · context · time; **read/unread** affordance; click → the source surface.
3. **Empty / all-read** — calm "You're all caught up" (distinct from the Dashboard queue).

### Spotlight overlay
- App **dimmed** (scrim) · the **target element ringed** · a small **label/callout** ("This is the Publish button") · auto-dismiss / Esc. Owned by the assistant.

### Connectivity indicator
- A compact utility-cluster chip: **Connected** (neutral) · **Saving…** (in progress) · **Offline** (warning, with the editor's blocked-operation messaging).

---

## 6. The Assistant Action Model (recap)

- **Immediate (no confirmation):** navigate to a page/doc/spec/setting; look up + display info (read cards).
- **Confirmation required (batched):** create product/component; create/update spec values; generate a document (opens the New Document flow pre-filled); add a comment; change a workflow state. **Progressive batching** = reads/navs run now; **writes** present as one confirmation card (line items) → Confirm/Cancel the batch.
- **Context-aware:** every message carries the user's **current module/view/selection/role**; the assistant references it and can offer to navigate.
- **Session memory:** conversation persists in-session; cleared on logout/close; per-tab.
- **Status:** the header avatar shows idle/searching/done; errors surface in chat with a helpful redirect.

---

## 7. User Flows

### Ask → navigate (read, immediate)
1. Help/⌘J → "Where do I set domain owners?" → Arther answers + **offers to navigate** → click → lands in Settings → Domain Ownership.

### Ask → act (write, confirmed)
1. "Create a datasheet for Servo X1 and set rated voltage to 48 V" → Arther runs reads/navs, then shows a **confirmation card**: ① Create document (Datasheet · Servo X1) ② Set Rated voltage = 48 V → **Confirm** → executes → reports success (status → done).

### Jump with the palette
1. **⌘K** → type "servo datasheet" → **Jump to** result → ↵ → opens it. Or type "new document" → **Actions** → runs the flow. (No AI, deterministic.)

### Triage a notification
1. **Bell** → slide-over → "Priya mentioned you in Servo X1 — Electrical" → click → opens the Editor at the comment. (Persistent work items live on the Dashboard; notifications are the feed.)

### Be shown where (spotlight)
1. "How do I publish?" → Arther → **spotlight** rings the Publish control with a label → Esc to dismiss.

### Lose/restore connection
1. Editing offline → indicator → **Offline** + queued-save messaging → reconnect → **Saving… → Connected**.

---

## 8. States

Assistant: first-open (suggested prompts) · working (typing) · read-result card · write-confirm card · done · error. Palette: results · no-match. Notifications: grouped · all-read. Spotlight. Connectivity: Connected · Saving · Offline. Loading.

---

## 9. Naming Conventions

| Concept | Label | Notes |
|---|---|---|
| The assistant | **Ask Arther** | "Help" = the entry label; "Ask Arther" = its name |
| Assistant shortcut | **⌘J** | Panel toggle |
| Jump/run surface | **Command palette** | **⌘K**; deterministic, no AI |
| Incoming feed | **Notifications** | Bell; unified channel; slide-over |
| Point-at-UI | **Spotlight** | Owned by the assistant |
| Batched writes | **Confirmation** | One card, line items, Confirm/Cancel |
| Connection state | **Connected · Saving · Offline** | Utility-cluster chip |

---

## 10. Component Reuse Map

| Component | Source | Use |
|---|---|---|
| Top bar (utility cluster: search · bell · help · avatar) | App-shell (already built) | The triggers |
| **Ask Arther panel** | New (cross-cutting) | Slide-in chat: header avatar · messages · cards · input |
| Command palette row | DS molecule | Palette result rows |
| Notification item | DS molecule | Notifications slide-over rows |
| Avatar · Spec token · Status pill · Button · Text field | DS | Panel avatar, read/confirm cards, actions, input |
| Doc/Product card | DS | Read-result cards (a document, a product) |
| Scrim + absolute panel | Shell overlay pattern | Palette modal, slide-overs, spotlight dim |
| Skeleton | DS | Loading |

---

## 11. URLs & Shortcuts

- These are **overlay states**, not routes — they open over the current URL and close back to it. Optional deep-link query params: `?assistant=1` (open panel), `?palette=1`, `?notifications=1`.
- Shortcuts: **⌘J** assistant · **⌘K** command palette · **Esc** closes any overlay · bell click = notifications.
- The assistant's **actions** deep-link into the owning surfaces (e.g. New Document flow pre-filled, Settings section, Editor at a comment).

---

## 12. Resolved Decisions (this pass)

1. **Three distinct surfaces, three triggers** — assistant (Help/⌘J), palette (⌘K), notifications (bell) — never merged; each a clear job.
2. **Ask Arther = right slide-in panel, read + write, progressive-batch confirm, no floating character** (avatar in the panel header).
3. **Notifications = unified right slide-over** (the one delivery channel); **the Dashboard remains the action queue** — notifications route into it.
4. **Spotlight is the assistant's** point-at-UI mechanism (dim + ring + label).
5. **Connectivity** indicator lives in the utility cluster (Connected/Saving/Offline) and drives editor offline behaviour.
6. **All overlay, never silent** — these surfaces don't navigate or mutate without an explicit hand-off or confirmation.

*Open (resolve during build):* whether the palette and assistant share a single input affordance at some breakpoints (kept separate at launch); notification grouping rules depth; assistant suggested-prompt curation per mode.

---

## 13. Out of Scope (this pass)

The assistant's **LLM / system prompt / action schema** internals (Ask Arther spec); **notification delivery, email, batching, and preferences** (Collaboration §9 + Settings → Notifications); the **action targets** (owning modes/IAs); the **Dashboard** action queue (Dashboard IA); per-mode **empty states** + **onboarding checklist** (Onboarding/each IA); assistant **proactive mode** + **cross-session memory** (Ask Arther v2, deferred); responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — Cross-Cutting Layer Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the shell-carried surfaces: the Ask Arther assistant panel (Help/⌘J, right slide-in, read + write with progressive-batch confirmation, spotlight, session memory), the ⌘K command palette (jump/search/run), the notifications slide-over (unified feed), and the connectivity indicator — their triggers, boundaries, and anatomy. Extends `arther-app-shell-ia.md` (§5.4) and `arther-app-ia.md` (§5); realizes Ask Arther v1.1, Collaboration §9, and Onboarding spotlight. Last in the roadmap: the Public Portal visitor IA.*
