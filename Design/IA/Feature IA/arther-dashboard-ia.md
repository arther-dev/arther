# Information Architecture: Arther — Dashboard

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **Dashboard** mode (the default landing surface). Extends `arther-app-shell-ia.md` (Dashboard = a rail exception, single surface) and `arther-app-ia.md` (§4.1, §3.4 Flows B/D), and realizes the **Action Dashboard** + **review modal** from Smart Spec Tracking (v1.3 §3.5–§3.6) plus Collaboration item types and the Onboarding setup checklist.
**Decisions this pass (queue layout chosen via mockups, 6 Jun 2026 — grouped by action):** (1) the Dashboard's action queue is **grouped by action type** (Awaiting approval · Section reviews · Overrides · Snippet reviews · Mentions · Briefs), newest-first within each group, scoped to the current user, fronted by a compact **stat-tile row**; (2) cards resolve in **three interaction modes** — *act-here* (override reviews), *review modal* (section/snippet reviews), *navigate* (approvals, mentions, briefs); (3) the **review modal** is a full-page git-diff surface *over* the dashboard; (4) **Overview / Activity** is an optional segmented control (Overview default); (5) **first-run** swaps the queue for an admin setup checklist (or a member "generate your first document" empty state).

**This IA draws a hard line the app-wide IA set:** the **Dashboard is the personal "what needs me now"** queue; the **workspace review/approval pipeline ("state of all reviews") lives in Documents → Reviews**. Document-approval and review-requested items here **deep-link into Reviews**; they are not duplicated.

---

## 1. Purpose & Scope

The Dashboard is the reason to open Arther each morning. It is the **Action Dashboard** from Smart Spec Tracking, generalized to carry every item that requires the current user's attention — section reviews after a spec change, override confirmations, publish approvals, snippet reviews, missing-brief prompts, comment mentions, and review requests — in one chronological queue, with the **review modal** as the focused work surface over it. It is action-oriented, not a marketing home: information-dense, personal, and resolvable in place wherever possible.

**In scope:** the landing surface and its regions (greeting, stat tiles, action queue); the **action-item taxonomy** (seven types) and their **interaction modes** (act-here / review modal / navigate); the **review modal** (git-diff section/snippet review); the **first-run** states (admin setup checklist, member empty state); the **all-caught-up** empty state; the optional **Activity** view; "Show resolved" + filtering; states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** the staleness cascade engine and domain-ownership routing (Smart Spec Tracking); the **workspace Reviews queue** and the per-document Review surface (Reviews & Review-flow IA); notification **delivery** + per-user preferences (Collaboration / Settings → Notifications); the full **publish flow** (Editor/Portal); **Product Brief** authoring (Specs); cross-workspace analytics (Portal → Analytics); and all visual / design-system work.

---

## 2. Where the Dashboard Sits (shell recap)

Dashboard is the **default post-login mode** and one of the shell's two **rail exceptions** — it has **no local rail and no Inspector**. It is a **single content surface** under the persistent top bar, with an optional **Overview / Activity** segmented control at the top of the content (no Navigator in Overview). The **review modal** is a global overlay that opens over this surface and returns the user to their scroll position on close.

Two governing ideas: the Dashboard is **personal** (every item is scoped to the current user — `assigned_to == me`; no one sees others' items), and it is **chronological** (ordered by `created_at` descending). Breadth — the "state of all reviews across the workspace" — belongs to **Documents → Reviews**, which this surface links into.

---

## 3. Surface & View Map

The Dashboard's views and key states, each with its URL.

- **Overview** `/dashboard` *(default landing)* — stat tiles + the action queue
  - **Action queue (has items)** — the typed-card feed
  - **All caught up** — no pending items → calm empty state + recent-docs shortcut
  - **First-run (admin)** `/dashboard?firstrun=1` — setup checklist replaces the queue
  - **First-run (member)** — "Generate your first document" empty state
  - **Show resolved** `…?resolved=1` · **Filter by type** `…?type=section_review|approval|…`
- **Activity** `/dashboard?view=activity` — chronological workspace activity feed (read-only)
- **Review modal** `/dashboard?review={itemId}` — full-page git-diff modal over the queue (section & snippet reviews); `&edit=1` reveals the lightweight prose editor
- **Loading** — chrome first; tile + card skeletons

Items that *navigate away* (they are not Dashboard surfaces): **document_approval** → the document's **publish flow** (`/documents/{id}/edit?dialog=publish`); **comment_mention** → the **Editor** at the comment; **placeholder_brief** → **Specs → Brief tab**; **review_requested** → the **Reviews** queue / the document's Review surface.

---

## 4. Navigation Model (within the Dashboard)

- **Primary:** vertical scroll through the **action queue**. No rail. The optional **Overview / Activity** segmented control switches the two read modes.
- **Filtering / scope:** a **type filter** (All · Reviews · Approvals · Overrides · Mentions · Briefs) and a **"Show resolved"** toggle; default is all pending, newest first. Stat tiles act as **scroll-to / filter shortcuts** (clicking "Section reviews" filters the queue to that type).
- **Resolve in place vs. drill:** *act-here* cards resolve on the card; *review-modal* cards open the modal (and return on close); *navigate* cards leave the Dashboard for the owning surface.
- **Utility:** inherited from the shell top bar — tabs, ⌘K palette, notifications slide-over (the **delivery** channel; the Dashboard is the **work** surface), Help (Ask Arther), account.
- **Keyboard (provisional):** `j/k` move between cards · `↵` open the focused card's primary action · `e` Edit prose in the modal · `Esc` close the modal.
- **Mobile:** not a target (authoring is desktop-only).

---

## 5. Region Content Hierarchy

Single surface, top to bottom.

### Header
1. **Greeting + date** — "Good morning, Callum · Friday 6 June" (lightweight identity, not decorative).
2. **Overview / Activity** segmented control (optional; Overview default).

### Stat tiles (at-a-glance counts)
A compact row of metric tiles, each a **filter shortcut** into the queue, plus one workspace tile:
1. **Awaiting your approval** — count of `document_approval` items.
2. **Section reviews** — count of pending `section_review` (+ `snippet_review`) items.
3. **Override reviews** — count of pending `override_review` items.
4. **Stale documents (workspace)** — the live workspace stale-count; **deep-links to Portal → Analytics** for the full picture (this is the only non-personal tile).

### Action queue (the core)
1. **Queue header** — "Your dashboard" + **Show resolved** toggle; groups are collapsible.
2. **Typed action cards, grouped by action type** under collapsible section headers (Awaiting your approval · Section reviews · Overrides · Snippet reviews · Mentions · Briefs), ordered by urgency (approvals first); **newest-first within each group**. Each card carries: a **type label** (SECTION REVIEW, OVERRIDE REVIEW, DOCUMENT APPROVAL, SNIPPET REVIEW, BRIEF NEEDED, MENTION, REVIEW REQUESTED), a **timestamp**, a **title** (`Electrical Characteristics — Industrial Servo A`), a **context** line (`Rated Voltage changed: 36 V → 48 V`), and its **action(s)** per the interaction mode (§6).
3. **Consolidation** — multiple same-category changes to one section collapse into a single card with a multi-change context (`field_change_diffs` accumulate).
4. **Empty / all-caught-up** — when nothing is pending: a calm state ("You're all caught up") + a recent-documents shortcut.

### First-run checklist (admin, replaces the queue)
An ordered **setup checklist** with per-step completion + CTA: **Create a Brand Profile** → **Create a Document Type** → **Invite your team** → **Add your first product** → (then) **Generate your first document**. Dismissible once core steps are done; members instead see a single "Generate your first document" empty state.

### Review modal (overlay — §6 detail)
Three zones: **What changed** (left) · **Section to review** (right, git-diff) · **Actions** (footer).

### Activity (alternate view)
A read-only **chronological feed** of workspace events (publishes, spec changes, reviews resolved, members joined) — context, not tasks. No actions; items link to their object.

---

## 6. Action-Item Taxonomy & Interaction Modes

Every card is a `DashboardActionItem` (Smart Spec Tracking §4.8). Three interaction modes:

| Type | Label | Mode | On the card / where it goes |
|---|---|---|---|
| `override_review` | Override review | **Act here** | Inline **Confirm · Update · Remove** (Update reveals an inline value field); resolves the `ScalarOverrideReviewItem` without leaving the card |
| `section_review` | Section review | **Review modal** | **Review →** opens the git-diff modal; Approve / Edit prose / Open full document |
| `snippet_review` | Snippet review | **Review modal** | Same modal, showing the **snippet's** prose; resolving notifies embedding-doc owners |
| `document_approval` | Document approval | **Navigate** | **Publish →** → the document's publish flow (deliberate act, full context) |
| `comment_mention` | Mention | **Navigate** | **Reply →** → the Editor at the comment thread |
| `placeholder_brief` | Brief needed | **Navigate** | **Add brief →** → Specs → Brief tab (fragment that unblocks generation) |
| `review_requested` | Review requested | **Navigate** | **Open →** → the document's **Review surface** (in Documents → Reviews) |

**Act-here** is reserved for decisions with full context on the card (overrides: old component value, new value, current override). **Review modal** is for prose judgment (needs the diff + surrounding text). **Navigate** is for deliberate, full-context acts (publishing, replying, briefing) that belong on their own surface. Resolved items leave the queue (recoverable via **Show resolved**).

### The review modal (git-diff)
- **What changed** (left) — the `FieldChangeDiff` list: field, component, old → new value, who, when.
- **Section to review** (right) — the working-copy prose with auto-updated tokens shown as chips; **clean merges** listed with `✓` (no action), **potential conflicts** marked `⚠` inline (prose that may now be inaccurate).
- **Actions** (footer) — **Approve section** (accurate as-is) · **Edit prose** (lightweight inline editor — text + token insert only; no block restructuring) · **Open full document ↗** (closes the modal → Editor at the section).
- Resolving the **last** section review for a document creates the owner's `document_approval` card.

---

## 7. User Flows

### Morning triage (the core loop)
1. Land on **Overview** → scan stat tiles → work the queue top-down.
2. **Override review** → Confirm / Update / Remove on the card. **Section review** → modal → Approve or Edit prose → close.
3. When a document's sections all clear → a **Document approval** card appears → **Publish →**.

### Resolve a spec-change cascade (Flow B, dashboard half)
1. A domain owner receives **section_review** cards (one per affected section).
2. Each → review modal → read *what changed* → judge the `⚠` prose → Approve / Edit.
3. Owner gets the **document_approval** card → publishes → the portal snapshot updates.

### Confirm an override (act-here)
1. **Override review** card shows component default 36 V → 48 V · your override 24 V.
2. **Confirm** (keep), **Update** (inline new value), or **Remove** (inherit default) — resolved on the card.

### Snippet review at source
1. **Snippet review** card → modal shows the **snippet's** prose → Approve / Edit → embedding-doc owners are notified (their docs stay their responsibility to republish).

### First-run (admin onboarding — Flow D)
1. New workspace → Dashboard shows the **setup checklist** instead of a queue.
2. Brand Profile → Document Type → Invite → Add product → **Generate your first document** → real queue takes over.

### Respond to a mention / add a brief
1. **Mention** → Reply → Editor at the thread. **Brief needed** → Add brief → Specs Brief tab (clears placeholder blocks downstream).

---

## 8. States

Overview · action queue (has items) · all-caught-up (empty) · first-run admin checklist · first-run member empty · Show-resolved · filtered-by-type · review modal (section) · review modal (snippet) · review modal (edit-prose) · Activity feed · Loading.

**State precedence (mutually exclusive — evaluated top-down, first match wins):**

1. **First-run** — the workspace has not completed core setup (no Brand Profile **or** no Document Type **or** no product). Admins see the **setup checklist**; members see the "Generate your first document" empty. This takes precedence over everything below, even if incidental action items exist, so a half-set-up workspace is never shown a normal queue.
2. **Action queue (has items)** — setup is complete **and** ≥1 unresolved item is assigned to the user.
3. **All caught up** — setup is complete **and** zero unresolved items. The calm positive state (single ghost CTA).

Because the conditions are ordered and exclusive, the first-run checklist and the all-caught-up state can never both qualify: all-caught-up is only reachable once setup is done, at which point first-run no longer matches.

---

## 9. Naming Conventions

| Concept | Label in UI | Notes |
|---|---|---|
| The mode | **Dashboard** | Default landing; personal action queue |
| A queue entry | **Action item** | Typed card; "task that needs me" |
| Spec-change prose task | **Section review** | Opens the review modal |
| Override confirmation | **Override review** | Act-here (Confirm/Update/Remove) |
| Publish-ready task | **Document approval** | Navigates to the publish flow |
| The git-diff surface | **Review** (modal) | Distinct from Documents → **Reviews** (queue) and the per-doc **Review surface** |
| Read-only event log | **Activity** | The alternate segmented view; not tasks |
| Workspace out-of-date count | **Stale documents** | The one non-personal tile; links to Portal → Analytics |
| First-run admin tasks | **Setup checklist** | Brand Profile · Document Type · Invite · First product |

---

## 10. Component Reuse Map

| Component | Source | Use on the Dashboard |
|---|---|---|
| Top bar | App-shell | Persistent chrome (Dashboard has no rail/Inspector) |
| **Metric card** | DS molecule | The stat-tile row |
| **Action card** | New (Dashboard) | Typed queue cards (label · title · context · actions); variant per interaction mode |
| Button · Tab · Status pill · Avatar | DS atoms | Card actions, Overview/Activity segmented control, type labels, mention authors |
| Wizard step | DS molecule | The first-run setup checklist steps |
| **Review modal** (3-zone) | New (shared w/ Reviews) | Section/snippet git-diff review; the diff render is reused by the per-doc Review surface |
| Spec token | DS atom | Auto-updated tokens shown as chips inside the modal's prose |
| Skeleton | DS atom | Loading state |

---

## 11. Content Growth Plan

- **Action items** grow → newest-first ordering, **type filter**, **Show resolved**, and **consolidation** of same-category changes keep the queue legible; pagination/infinite scroll below the fold.
- **Stat tiles** stay fixed (4); counts scale, not the layout.
- **Activity** grows → paginates by day.
- A user with **zero items** is the goal state, not an edge case — the all-caught-up state is designed, not an afterthought.

---

## 12. URL Strategy

- Overview: `/dashboard` (default) with `?view=activity`, `?type=…`, `?resolved=1`, `?firstrun=1`.
- Review modal: `/dashboard?review={itemId}` (`&edit=1` for the inline editor) — an overlay state that returns to the queue on close.
- Navigate-away items deep-link to their owning surface: `/documents/{id}/edit?dialog=publish`, `/documents/{id}/edit?block={id}` (mention), `/specs/product/{id}?tab=brief`, `/documents/reviews` (review-requested).
- Reserves the `/{workspaceSlug}/…` prefix per the shell.

---

## 13. Resolved Decisions (this pass)

1. **Grouped by action type** (Awaiting approval · Section reviews · Overrides · Snippet reviews · Mentions · Briefs), newest-first within each group *(chosen via mockups, 6 Jun 2026; the alternative — a single chronological feed — was Smart Spec Tracking §3.5's literal model)* — fronted by a compact stat-tile row; collapsible groups + Show resolved; groups ordered by urgency (approvals first), items by recency within.
2. **Three interaction modes** — act-here (overrides), review modal (section/snippet), navigate (approvals/mentions/briefs/review-requested).
3. **Review modal is an overlay** over the queue (git-diff, three zones), not a separate route/mode.
4. **Overview / Activity** = optional segmented control; Overview default; no Navigator/rail.
5. **First-run** replaces the queue with the admin setup checklist (members: single empty state).
6. **Dashboard = personal; Documents → Reviews = workspace pipeline** — approval/review-requested items deep-link into Reviews; no duplication.

*Open (resolve during build):* the **review-item consolidation window** (spec open Q); whether `document_approval` always emails regardless of preference (spec open Q); exact **stat-tile set** (4 proposed) and whether the workspace stale tile shows a sparkline.

---

## 14. Out of Scope (this pass)

The staleness cascade + domain-ownership routing (Smart Spec Tracking); the **Reviews queue** and per-document **Review surface** (their own IA); notification **delivery** + preferences (Collaboration / Settings); the full **publish flow** and **Editor** (their IAs); **Brief** authoring (Specs); workspace **analytics** depth (Portal → Analytics); the **command palette** and **Ask Arther** (cross-cutting IA); responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — Dashboard Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the default landing surface: the personal, chronological action queue (seven typed item types across three interaction modes), the git-diff review modal, the stat-tile row, the first-run setup checklist, the all-caught-up and Activity states. Extends `arther-app-shell-ia.md` and `arther-app-ia.md` (§4.1, Flows B/D); realizes Smart Spec Tracking v1.3 §3.5–§3.6 and the Collaboration item types. Next in the roadmap: the Reviews & Review-flow IA (which reuses this review modal's diff render).*
