# Information Architecture: Arther — Reviews & Review Flow

**Version:** 0.1
**Date:** 6 June 2026
**Status:** Page-level IA for the **Reviews** rail view (Documents mode) and the per-document **Review surface**, plus the review lifecycle flows. Extends `arther-app-shell-ia.md`, `arther-app-ia.md` (§4.3, §3.4 Flow A/B, §11 Decision 12), and `arther-editor-ia.md` (the Review read-only state); realizes the Collaboration & Review spec (v1.1).
**Decisions this pass (queue layout chosen via mockups, 6 Jun 2026 — grouped by relationship):** (1) **Reviews** is a **dedicated rail view in Documents** — a **workspace review/approval queue** of every in-flight document; (2) the per-document **Review surface** is a **read-only doc canvas + a reviewer-status header + a Comments-first Inspector**, opened as a drill-in; (3) **Send for review** is a focused **brief screen** (reviewers roster · message · due date) preceded by an advisory **pre-flight** checklist; (4) the only formal approver actions are **Approve** and **Send Back** (comments = de-facto "request changes"); **Send Back** requires a reason and surfaces as a persistent **banner** on the returned Draft; (5) **owner override** is a confirmation modal with a mandatory reason, flagged in the audit trail.

**This IA draws the line with its neighbours:** the **Dashboard** is the *personal* "what needs me" queue (review items there **deep-link into Reviews**); **Reviews** is the *workspace* pipeline ("state of all reviews"); the **Editor** owns authoring + the comment-anchoring mechanics. Reviews reuses the Editor's read-only render and the comment thread component; it does **not** duplicate the Dashboard's section-diff review modal (that is spec-change prose review, a different surface).

---

## 1. Purpose & Scope

Reviews is where documents move from draft to live under control. It answers two questions: for the **team**, "what is in review across the workspace, and who is blocking?"; for the **individual**, "what is waiting on my approval?" The per-document **Review surface** is where an approver actually reads the document read-only, leaves anchored comments, and records **Approve** or **Send Back** — the auditable sign-off that hardware docs in regulated markets require.

**In scope:** the **Reviews queue** (rail view: grouping, filters, per-document approval roster + state); the **Review surface** (read-only canvas, reviewer-status header, Comments Inspector, Approve / Send Back); the **send-for-review** brief + pre-flight; the **Send Back / changes-requested** flow + rejection banner; the **reviewer status** model (Pending · Commented · Approved · Rejected); **owner override**; the document **state machine** as it surfaces here; states, flows, naming, component reuse, and URLs.

**Out of scope (referenced at the boundary):** document **authoring** + comment-anchoring internals + the rejection banner *in the editor* (Editor IA); **approval-role configuration** (Settings → Document Types); **notification delivery** + preferences (Collaboration / Settings → Notifications); the spec-change **section review modal** (Dashboard IA); the **publish flow** + portal snapshot (Portal IA); **external reviewers** + **portal visitor commenting** (post-launch); and all visual / design-system work.

---

## 2. Where Reviews Sits (shell recap)

Reviews is a **rail view inside the Documents mode** (rail = Library · **Reviews** · Templates · Archive). Selecting it shows the **queue** in the content area; the **Navigator** carries filters/saved views; there is no Inspector on the queue. Opening a document from the queue opens its **Review surface** as a **tab** — a read-only sibling of the Editor (`/documents/{id}/review`) with the standard 5-region shell: a **reviewer-status header** in the contextual toolbar, the **read-only block canvas** in the content area, and a **Comments-first Inspector**.

Governing relationships: **Reviews = workspace pipeline**, **Dashboard = personal queue** (its `review_requested` / `document_approval` items deep-link here), **Editor = authoring** (Send for review launches from the Editor; a Send Back returns the document to the Editor in Draft with a banner).

---

## 3. Surface & View Map

- **Reviews queue** (rail view) `/documents/reviews` *(default for the rail)*
  - **Grouped by my relationship** (default): **Awaiting my approval** · **My documents in review** · **Changes requested** · (optionally) **All in review**
  - **Mine / All** scope toggle · filter by Document Type, approver, due date · sort
  - **Empty** — nothing in review → calm state
- **Review surface** (per-document, read-only) `/documents/{id}/review`
  - Reviewer-status header (per-role status) · read-only canvas · **Comments** Inspector
  - `…?comment={threadId}` deep-links to a thread · `&show=resolved` shows resolved threads
  - **Detached comments** section (orphaned anchors) below the body
  - Approver view (Approve / Send Back) vs. owner view (status + pull-back); reviewer view (comment only)
- **Send for review** `/documents/{id}/edit?dialog=send-for-review` — the **brief screen**: reviewers roster · message · due date, preceded by the **pre-flight checklist**
- **Send Back** `…?dialog=send-back` — modal with a **mandatory reason**
- **Owner override** `…?dialog=override` — confirm + mandatory reason, per missing role
- **Changes requested (Draft)** — the document back in the **Editor** in Draft with a persistent **rejection banner** (Editor surface; referenced here)
- **Loading** — chrome first; queue rows / canvas / comments skeletons

---

## 4. Navigation Model

- **Into the queue:** the Documents **rail → Reviews**; the top-bar **notifications** ("sent for review", "rejected") and **Dashboard** items deep-link straight to a document's Review surface.
- **Within the queue:** scan **Awaiting my approval** first; **Mine / All** toggle widens scope to the whole workspace pipeline; filters/sort narrow it. Each row → opens that document's **Review surface**.
- **Within the Review surface:** read the canvas top-to-bottom; the **Comments** Inspector lists threads (jump-to-block on click); the **reviewer-status header** shows who has approved / commented / is pending; approver actions (**Approve · Send Back**) sit in the header/footer.
- **Out:** **Open in editor** (owner, for rework) · **Back to Reviews** (close the tab).
- **Keyboard (provisional):** `[`/`]` prev/next thread · `a` Approve (approver) · `Esc` close dialogs.
- **Mobile:** not a target (desktop-only).

---

## 5. Region Content Hierarchy

### Reviews queue (content area; Navigator = filters)
1. **Queue header** — "Reviews" + **Mine / All** scope toggle + count.
2. **Grouped sections** (collapsible): **Awaiting my approval** (the user is an assigned approver, not yet acted) · **My documents in review** (owner view — who's blocking) · **Changes requested** (returned to Draft, owner must act) · **All in review** (workspace, when scope = All).
3. **Document row** — title + Document Type; **state** pill (Review / Approved / Changes requested); the **approval roster** (per-role avatars with status: ✓ approved, • commented, ○ pending, ✕ rejected); owner; **due date** (with overdue emphasis); last activity. Row → Review surface.
4. **Navigator (left)** — filters/saved views: by Document Type, by approver, due this week, overdue; "mine vs all".
5. **Empty** — "Nothing's in review" + a shortcut to the Library.

### Review surface (per document)
1. **Reviewer-status header** (contextual toolbar) — document title + revision + **state**; the **per-role status row** (each required role + assignee + status); for the **owner**: pull-back + (if blocked) **override**; for an **approver**: **Approve** · **Send Back**; the review **brief message** + **due date**.
2. **Read-only canvas** (content) — the document's blocks rendered read-only (same render as Editor Preview); spec tokens shown as chips; comment anchors highlighted; **text-range** highlights underlined.
3. **Comments Inspector** (right, Comments-first) — threads for this revision: author · anchor (block / text-range) · body · one-level replies · **resolve**; **Show resolved** toggle; **add comment** (anchored to selection); **@mention**.
4. **Detached comments** — orphaned-anchor threads (block regenerated / anchored text edited) collected below the body; the owner re-anchors / resolves / dismisses.

### Send for review (brief screen)
1. **Pre-flight checklist** (advisory) — placeholder blocks · unresolved carried-forward comments · stale spec-linked blocks · orphaned tokens; each links to the issue; **non-blocking**.
2. **Reviewers** — each required role + its assignee (read-only; vacant role **blocks** submission with an admin prompt).
3. **Message to reviewers** (optional, prominent: "What should reviewers focus on?").
4. **Due date** (optional) — drives reminders + the queue's overdue emphasis.
5. **Send for review** action.

### Send Back / Override (modals)
- **Send Back** — mandatory **reason** (→ permanent audit + the Draft banner); resets all approvals.
- **Owner override** — pick the missing role, mandatory **reason**; recorded distinctly ("Approved on behalf of …"), never shown as a normal approval.

---

## 6. The State Machine (recap — where it surfaces)

`Draft → Review → Approved → Published`, with `Review → Draft` (pull back / **Send Back**), `Approved → Review|Draft` (pull back), `Published → Draft` (Create Revision). **AND logic**: the system moves to **Approved** only when the last required role approves; **one Send Back returns immediately** and **resets all approvals**.

| State | Where the user meets it |
|---|---|
| **Draft** | Editor (authoring); a returned doc shows the **rejection banner** |
| **Review** | **Review surface** (read-only); appears in the **Reviews queue** |
| **Approved** | Review surface (locked) + queue; owner sees **Publish** / pull-back |
| **Published** | Portal; owner can **Create Revision** → new Draft |

---

## 7. User Flows

### Send a document for review (owner)
1. Editor → **Send for review** → **pre-flight** checklist (advisory) → **brief screen** (reviewers · message · due date).
2. Submit → state **Review**, document locks, assigned approvers notified → it appears in their **Awaiting my approval**.

### Approve (approver)
1. Notification / Dashboard / Reviews queue → **Review surface**.
2. Read + comment as needed → **Approve**. When the **last** required role approves → **Approved**; the owner gets a **document_approval** Dashboard item → **Publish**.

### Send Back / request changes (approver)
1. Either leave unresolved **comments** (de-facto "please change this") and Approve later, or **Send Back** with a **mandatory reason**.
2. Send Back → document returns to **Draft** immediately, **all approvals reset**, owner notified; the **rejection banner** persists on the Draft until resubmitted.

### Owner override (exceptional)
1. A required role is vacant/unavailable and the release is time-sensitive → **override** → confirm + reason → recorded as an override (flagged), not a normal approval.

### Create a revision (owner, on a Published doc)
1. **Create Revision** → new Draft forked from the snapshot (snapshot stays live); **carry forward** unresolved comments (prompted) → edit → Send for review.

### Triage the workspace pipeline (owner / lead)
1. Reviews queue → **All** scope → see every in-review doc, who's blocking, what's overdue → nudge the right approver.

---

## 8. States

Queue — grouped (default) · queue — All scope · queue — filtered · queue — empty · Review surface (approver) · Review surface (owner) · Review surface (reviewer, comment-only) · Approved (locked) · Send-for-review brief · pre-flight (issues present) · Send Back modal · owner-override modal · changes-requested (Draft + banner) · detached comments · Loading.

---

## 9. Naming Conventions

| Concept | Label in UI | Notes |
|---|---|---|
| Rail view | **Reviews** | Workspace review/approval **queue** (Documents rail) |
| Per-document read-only surface | **Review** (surface) | Distinct from the rail **Reviews** queue and the Dashboard section **review modal** |
| Formal approver actions | **Approve** · **Send Back** | No separate "request changes" — unresolved comments serve that role |
| Returned document | **Changes requested** | Draft + a persistent rejection banner |
| Per-role progress | **Reviewer status** | Pending · Commented · Approved · Rejected |
| All-must-approve | **AND logic** | Approved only when the last required role approves |
| Owner approves for a missing role | **Owner override** | Mandatory reason; flagged in audit; never a normal approval |
| Named working copy | **Revision** | Forked from a published snapshot |

---

## 10. Component Reuse Map

| Component | Source | Use in Reviews |
|---|---|---|
| Top bar · Local rail · Navigator · Inspector · Contextual toolbar | App-shell | The Documents shell; Reviews active in the rail |
| **Read-only block canvas** | Reuses Editor Preview render | The Review surface body |
| **Comment thread** | Shared w/ Editor | The Comments Inspector + detached section |
| **Approval roster** (avatars + status) | New (Reviews) | Queue rows + the reviewer-status header |
| Status pill · Avatar · Button · Tab | DS atoms | State pills, approver avatars, Approve/Send Back, Inspector tabs |
| Doc card / Table row | DS | Queue rows (grouped list or table per the §14 decision) |
| **Pre-flight checklist** | Shared w/ Publish + New Document | Send-for-review pre-flight |
| Text field · Date picker | DS | Brief message, due date, Send Back reason |
| Skeleton | DS | Loading |

---

## 11. Content Growth Plan

- **In-review documents** grow → grouping + **Mine/All** scope + filters (type, approver, due) + sort; pagination below the fold.
- **Approval roles** per type grow → the roster row wraps / collapses to "+N".
- **Comment threads** grow → revision-scoping keeps each cycle clean; **Show resolved** + detached section keep the working set legible.
- **Revisions** accumulate → the surface shows the current revision; history lives in the Editor's History tab + audit log.

---

## 12. URL Strategy

- Queue: `/documents/reviews` with `?scope=mine|all`, `?type=`, `?approver=`, `?due=overdue`, `?sort=`.
- Review surface: `/documents/{id}/review` with `?comment={threadId}`, `&show=resolved`.
- Flows (dialogs on the document): `…/edit?dialog=send-for-review|send-back|override`.
- Changes-requested Draft: `/documents/{id}/edit` (banner state — Editor).
- Reserves the `/{workspaceSlug}/…` prefix per the shell.

---

## 13. Resolved Decisions (this pass)

1. **Reviews queue = grouped by the user's relationship** *(chosen via mockups, 6 Jun 2026)* — sections Awaiting my approval · My documents in review · Changes requested, with a Mine/All scope toggle (All reveals the full workspace pipeline). The rejected alternative was a sortable workspace table.
2. **Review surface = read-only canvas + reviewer-status header + Comments Inspector** (a read-only sibling of the Editor, not a new shell).
3. **Approve / Send Back only**; comments are the "request changes" channel; **Send Back** needs a reason and resets approvals; the rejection surfaces as a **banner** on the Draft.
4. **Send for review = brief screen** (reviewers · message · due date) after an **advisory pre-flight**; a **vacant role blocks** submission.
5. **Owner override** = confirm + mandatory reason, audit-flagged.
6. **Reviews (workspace) ≠ Dashboard (personal) ≠ Editor (authoring)**; Reviews reuses the Editor read-only render + comment thread, and the shared pre-flight, but not the Dashboard section-diff modal.

*Open (resolve during build):* whether **Approved/Published** documents stay listed in the queue (with a filter) or drop off; the **detached-comments** affordance depth on the read-only surface; review-item consolidation with the Dashboard.

---

## 14. Out of Scope (this pass)

Document **authoring** + comment-anchor internals + the in-editor rejection banner (Editor IA); **approval-role configuration** (Settings → Document Types IA); **notification delivery** + preferences (Collaboration / Settings); the **publish flow** + portal snapshot (Portal IA); the Dashboard **section-review diff modal** (Dashboard IA); **external reviewers**, **portal visitor commenting**, **read receipts**, **Slack/Teams** (post-launch); responsive/mobile (desktop-only); and all visual / design-system work.

---

*Arther — Reviews & Review Flow Information Architecture. Version 0.1, 6 June 2026. Page-level IA for the Documents → Reviews workspace queue and the per-document read-only Review surface, plus the review lifecycle: send-for-review brief + pre-flight, reviewer status, Approve / Send Back with mandatory reason, owner override, and the four-state machine. Extends `arther-app-shell-ia.md`, `arther-app-ia.md` (§4.3, Decision 12) and `arther-editor-ia.md`; realizes the Collaboration & Review spec v1.1. With this, the high-priority per-screen IAs (Editor, Specs, New Document, Dashboard, Reviews) are complete; remaining: Import, Portal-management, Settings, Snippets, Cross-cutting, and the Public Portal visitor IA.*
