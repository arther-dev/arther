# Arther — Collaboration & Review: Feature Specification

**Version:** 1.1
**Date:** May 2026
**Status:** Specification complete — greenfield design
**Changes in v1.1:** Section 7.1 extended with sub-block text-range anchoring for prose blocks (`anchor_type`, `text_anchor` on `CommentThread`). Section 7.5 updated — orphaning now triggered by both block regeneration and targeted text edit/deletion that removes the anchored text span, not only by block regeneration. Section 10.4 `CommentThread` interface updated with `anchor_type` and `text_anchor` fields. Two new Design Decisions added.

---

## 1. Overview

### 1.1 Purpose

The Collaboration & Review feature is the workflow layer that governs how documents move from initial draft to live publication. It enforces an approval process before any document reaches the portal, maintains a complete audit trail of every review decision, and provides the comment and notification infrastructure that keeps the documentation team aligned throughout the process.

For hardware companies selling into regulated markets — industrial, medical, automotive — the review workflow is not a convenience feature. It is a compliance requirement. A datasheet or installation manual that reaches customers without formal technical and regulatory sign-off creates product liability and regulatory risk. Arther's review feature turns an informal, email-and-PDF-based approval process into a structured, auditable, in-product workflow.

### 1.2 Scope

This document specifies the Collaboration & Review feature as a self-contained feature: the document state machine, the working copy and revision model, the permission and approval model, the review request and rejection flows, the block-level comment model, the @mention system, and the notification architecture.

Spec field comments — annotations on spec database fields rather than document blocks — are a related but distinct surface. Their data model is owned by Feature 1 (Spec Database); their notification behaviour is part of the unified notification system specified here. The boundary is made explicit in Section 9.1 and in the Feature 1 specification (Section 6.7).

### 1.3 Role in Arther

The Collaboration & Review feature touches every other feature in the product:

- **Spec Database (Feature 1)** — spec field comments feed into the unified notification system; spec field changes trigger staleness notifications alongside collaboration notifications
- **AI Document Generator (Feature 2)** — Document Types carry approval role configuration; the generation flow produces documents that enter the review workflow
- **Visual Block Editor (Feature 3)** — block-level comments are anchored to the same block schema defined in the editor; editing permissions are gated by document state
- **Smart Spec Tracking (Feature 4)** — staleness events generate notifications through the same system as review events; the notification architecture must accommodate both
- **Publishing Portal (Feature 5)** — the Published state triggers a portal snapshot update; the working copy model determines what the portal serves at any given time

---

## 2. Core Concepts

### 2.1 Document States

Every document in Arther is in exactly one of four states at any point in time:

| State | Meaning |
|---|---|
| **Draft** | The document is editable. It is not visible on the portal. |
| **Review** | The document has been submitted for approval. It is locked from author edits. Assigned approvers can comment and approve or reject. |
| **Approved** | All required approvers have approved. The document is locked. It can be published or pulled back. |
| **Published** | A snapshot of the document is live on the portal. The published snapshot is immutable. |

Custom states are not supported at launch. The four states cover the complete lifecycle for the overwhelming majority of hardware documentation workflows. Custom states are a named post-launch addition.

### 2.2 The Working Copy Model

"Published" is not a mutable state like Draft or Review. It is a **tag on an immutable snapshot** — the most recent version of the document that passed through the full approval cycle and was pushed live.

At any point in time, a document exists in two parallel layers:

- **The published snapshot** — immutable; always live on the portal; never affected by work in progress
- **The working copy** — the current editable state; moves through Draft → Review → Approved

When a working copy reaches the Published state, it becomes the new published snapshot. The portal performs an atomic swap — visitors see the previous version until the moment the new snapshot goes live, then see the new version. There is no window where the portal is unavailable or serving a partial state.

This model means editing a published document never takes it off the portal. A document owner can open revision 2 in Draft while revision 1 continues serving portal visitors without interruption.

### 2.3 Document Revisions

A **revision** is a named working copy forked from a published snapshot with the intent to produce a new published version. Revisions are created explicitly — not automatically when a user first opens a published document.

When a document owner wants to update a published document, they click **"Create Revision"**. A modal confirms that the current published version will remain live while the new revision is in progress. The modal also displays the current published version identifier (revision number and published date) for clarity. The new revision enters Draft state as a full copy of the published snapshot.

Revisions are numbered sequentially (Revision 1, Revision 2, etc.) and their complete history — who created them, when, what states they moved through, and who approved them — is preserved permanently in the audit log.

### 2.4 Workflow Roles

Three distinct roles participate in the review workflow:

**Document Owner** — the workspace member responsible for a document. Typically the person who initiated generation. Owns state transitions: can send to Review, pull back to Draft, and publish once Approved. Cannot self-approve.

**Reviewer** — a workspace member with read access to a document in any state. Can comment on blocks and @mention colleagues. Cannot approve or trigger state transitions.

**Approver** — a workspace member assigned to an approval role on a Document Type. Can comment, approve, or reject (send back). Cannot edit document content except for minor corrections within the Review state (see Section 4.3). Approver permissions are per-Document-Type — being an Approver on Datasheets does not confer Approver status on Installation Manuals.

---

## 3. State Machine

### 3.1 The Four States

```
        ┌─────────────────────────────────────────────────────┐
        │                                                     │
        ▼                                                     │
     [DRAFT] ──────────────────────────────► [REVIEW]        │
        ▲                 send for review        │            │
        │                                        │            │
        │  pull back                 reject /    │ approve    │
        │  (owner)                   send back   │ (all       │
        │                            (approver)  │ approvers) │
        │                                        ▼            │
        │                                   [APPROVED]        │
        │                                        │            │
        │                 pull back              │ publish    │
        └──────────────── (owner) ◄─────────────┤ (owner)    │
                                                 │            │
                                                 ▼            │
                                           [PUBLISHED]        │
                                                 │            │
                                                 │ create     │
                                                 │ revision   │
                                                 └────────────┘
```

### 3.2 Transition Map

| From | To | Who | Condition |
|---|---|---|---|
| Draft | Review | Owner | Pre-flight check passed (or explicitly bypassed) |
| Review | Draft | Owner | Pull back — document returns to editable |
| Review | Draft | Approver | Rejection — mandatory reason required |
| Review | Approved | System | All required approvers have approved |
| Approved | Review | Owner | Pull back to review — document re-locks |
| Approved | Draft | Owner | Pull back to draft — document becomes editable |
| Approved | Published | Owner | Publishes portal snapshot; document enters Published state |
| Published | Draft | Owner | Via "Create Revision" — forks a new working copy; published snapshot remains live |

**One rejection returns immediately.** When any single approver rejects a document, it returns to Draft without waiting for other approvers to complete their review. The owner is notified immediately with the rejection reason. All approvals collected prior to the rejection are reset.

**Approved → Review vs. Approved → Draft.** Both backward transitions are available to the document owner. Approved → Review keeps the document locked from author edits and signals that the reviewers need another look. Approved → Draft unlocks the document for substantive rework before re-submitting.

### 3.3 Approval Logic

**AND logic** — all required approvers must approve before the document can transition to the Approved state. The system tracks approval status per approval role (see Section 4.1). The document moves to Approved automatically when the last required approval is recorded.

**Owner override.** In exceptional circumstances — a required approver is unavailable and the document is blocking a time-sensitive release — the document owner can approve on behalf of a missing reviewer. This action requires an explicit confirmation step and is recorded in the audit log with a distinct entry: *"Approved on behalf of [Approver Role] by [Owner Name] — override reason: [required text field]."* The override is visually flagged in the audit trail and is never presented as equivalent to a normal approval.

### 3.4 Approval Reset on Rejection

When a document is rejected and returns to Draft, all previously collected approvals are reset. When the document re-enters Review, every required approver must approve again from scratch.

This is intentional. Partial approval states — "two of three approvers already approved it" — create pressure to skip the remaining review steps and undermine the purpose of AND logic. The minor edit provision (Section 4.3) exists precisely to avoid full rejection cycles for genuinely trivial corrections.

---

## 4. Permission Model

### 4.1 Per-Document-Type Role Configuration

Approval role configuration lives on the **Document Type**, not on individual documents or workspace-level roles. A Datasheet Document Type has its own set of required approval roles. An Installation Manual Document Type has a different set. This matches how hardware companies actually operate — the sign-off list for a technical datasheet is different from the one for a quick-start guide.

Each Document Type defines a set of named approval roles. Examples: *Technical Reviewer*, *Regulatory Reviewer*, *Brand Reviewer*. These are role labels, not user identities. Workspace admins then assign specific workspace members to each role (see Section 4.2).

At launch, role labels are freeform strings defined by the workspace admin. Role-typed approval semantics — where a Technical Reviewer is formally understood to be approving accuracy and a Regulatory Reviewer is approving compliance language — is a post-launch capability. At launch, all approvals are functionally equivalent regardless of role label; the labels serve as organisational clarity, not system-enforced scope.

### 4.2 Role Assignment

Workspace admins assign workspace members to approval roles via the Document Type configuration screen. Assigning a person to a role gives them Approver permissions for all documents of that type.

Individual document owners cannot modify role assignments. This is intentional — bypassing required approvers by editing the reviewer list on a per-document basis would defeat the purpose of the approval model.

When a role has no assigned person (e.g. the regulatory lead left the company), the role appears as vacant in the Document Type configuration. A document cannot be sent for Review while any required role is vacant. The workspace admin must assign a replacement before review submission is possible.

### 4.3 Per-State Permission Matrix

| Action | Draft | Review | Approved | Published |
|---|---|---|---|---|
| Edit block content | Owner + Editors | Approvers only (minor corrections) | Nobody | Nobody |
| Add comment | Anyone | Anyone | Anyone | Internal team only |
| Approve | — | Assigned Approvers | — | — |
| Reject (send back) | — | Assigned Approvers | — | — |
| Send for Review | Owner | — | — | — |
| Pull back to Draft | Owner | Owner | Owner | — |
| Pull back to Review | — | — | Owner | — |
| Publish | — | — | Owner | — |
| Create Revision | — | — | — | Owner |
| Owner override approval | — | Owner | — | — |

**Minor corrections in Review.** Approvers may make minor corrections — typos, formatting errors — to a document in the Review state without triggering a full state reset to Draft. Minor corrections are logged in the document's edit history with a `minor_correction` flag and the approver's identity. The document does not re-enter Draft; the review cycle continues. Minor correction is explicitly not a mechanism for substantive content changes — it is a practical escape valve for the "approver spotted a typo" scenario.

---

## 5. Review Request Flow

### 5.1 Submission Step

When a document owner clicks **"Send for Review"**, Arther presents a **review brief screen** rather than a simple confirmation modal. The screen has three elements:

**Reviewers** — displays each required approval role and the workspace member currently assigned to it. The owner cannot remove required approvers. If a role is vacant, submission is blocked with a prompt to contact the workspace admin.

**Message to reviewers** — an optional free-text field. Surfaced prominently as a first-class input, not hidden in an advanced options panel. Suggested prompt: *"What should reviewers focus on in this review?"* Useful for flagging specific sections, providing context on changes from the previous revision, or noting external dependencies.

**Due date** — an optional date picker. When set, it drives reminder notifications (Section 9.2) and is displayed on the reviewer status dashboard.

### 5.2 Pre-Flight Check

Before presenting the review brief screen, Arther runs a pre-flight scan on the document and surfaces any issues that may affect the review. Issues are presented as a checklist the owner can review before proceeding.

**Pre-flight checks:**
- Placeholder blocks present (blocks where a spec field was null at generation time)
- Unresolved comment threads carried forward from the previous revision
- Spec-linked blocks in a stale state (field value has changed since generation)
- Orphaned spec tokens (source component or field has been archived)

The pre-flight check is advisory, not blocking. The owner can proceed to the review brief screen and submit despite open pre-flight items. The intent is to surface the obvious embarrassments — submitting a document with three placeholder blocks — before reviewers encounter them.

### 5.3 Reviewer Status Dashboard

Once a document is in Review, the owner sees a **reviewer status panel** on the document header. The panel shows each required approver's current status:

| Status | Meaning |
|---|---|
| Pending | Notified; no action taken yet |
| Commented | Has added at least one comment; has not yet approved or rejected |
| Approved | Has formally approved this revision |
| Rejected | Has sent the document back |

Read receipts ("opened") are not tracked or displayed at launch. Commented and Approved provide sufficient signal for the owner to know whether a reviewer is engaged. Read receipts are a named post-launch addition if owners indicate they need them.

### 5.4 Due Dates and Reminders

When a due date is set on a review submission, Arther generates two automated notifications:

1. **At the due date:** a reminder is sent to every approver who has not yet approved or rejected
2. **The day after the due date:** a notification is sent to the document owner listing the names of approvers who have not completed their review

No auto-escalation to workspace admins at launch. Escalation is a named post-launch addition. The owner is the right person to chase overdue reviewers; automated escalation that bypasses the owner creates political friction before it creates value.

---

## 6. Rejection Flow

### 6.1 Formal Actions

An approver reviewing a document has two formal actions available: **Approve** or **Send Back**.

The distinction between "request changes" and "reject" that appears in tools like GitHub Pull Requests is handled differently in Arther. **Adding comments without approving is the functional equivalent of requesting changes** — the document owner can see unresolved comment threads and understands what needs to be addressed. A separate "request changes" action would be redundant. The only formal actions are Approve (moves the approval forward) and Send Back (returns the document to Draft).

### 6.2 Mandatory Rejection Reason

When an approver clicks **Send Back**, Arther presents a modal with a mandatory free-text reason field. Submission is blocked until the reason is populated. There is no minimum length requirement — "see comments" is a valid reason — but the field cannot be left blank.

The mandatory reason requirement is intentional. An audit trail entry reading *"Sent back by [Name]"* with no attached reason is not useful for a compliance customer who needs to demonstrate that spec changes and document updates were deliberate and reviewed. The rejection reason is part of the permanent audit record.

### 6.3 Rejection Surfacing

When a document returns to Draft following a rejection, the rejection reason is surfaced as a **persistent banner** at the top of the document editor — not buried in the audit log. The banner displays:

> Returned to Draft by **[Approver Name]** on **[Date]**: "[Rejection reason]"

The banner persists until the owner dismisses it explicitly or the document is submitted for review again. It is visible to the owner and any workspace member with access to the document. It is not visible on the portal.

If a document is rejected by multiple approvers in sequence (which cannot happen in practice since one rejection immediately returns the document, but could occur if the document is rejected, resubmitted, and rejected again in a new cycle), only the most recent rejection banner is shown. Previous rejections are accessible in the audit log.

### 6.4 Approval Reset

All approvals collected in a review cycle are reset when a document is sent back. When the document re-enters Review — whether after the owner addresses the rejection feedback or for any other reason — every required approver must approve again from scratch. See Section 3.4 for rationale.

---

## 7. Comment Model

### 7.1 Block-Level and Text-Range Anchoring

Comments are anchored to specific blocks in the document editor, not to the document as a whole. Every comment must have an anchor — document-level comments (not anchored to a block) are not supported.

Two anchor granularities are available:

**Block-level anchoring** — the comment is associated with the entire block. Applies to all block types. The comment is displayed in the editor margin alongside the block it is anchored to. This is the default anchoring mode and the only mode available for structural, data, media, and container blocks.

**Text-range anchoring** — available in prose blocks (Paragraph, Heading) only. When a reviewer selects a specific span of text before clicking "Add comment", the comment is anchored to that text span rather than to the block as a whole. The anchored text is highlighted in the block with a distinct underline. Hovering the highlight shows the comment thread; clicking opens it in the comment panel.

Text-range anchoring enables precise feedback: "this sentence" rather than "this paragraph." A reviewer who wants to flag a specific word choice, technical claim, or spec value reference can target their feedback exactly. Block-level anchoring remains the appropriate mode for structural feedback about the block as a whole.

### 7.2 Comment Lifetime — Revision-Scoped

Comments are scoped to a document revision, not to the document entity. Each revision begins with its own comment set. Comments from previous revisions do not appear in the active editor view — they are accessible in the revision history panel but do not clutter the working surface.

This is the right model for a review workflow where comments are feedback on specific content that changes between revisions. A comment thread about the CE marking language in revision 1, already resolved and addressed in revision 2, should not surface as an active thread for revision 2 reviewers.

### 7.3 Unresolved Comment Carry-Forward

When a new revision is created from a published snapshot, Arther scans the previous revision's comment threads. Any thread that is **unresolved** at the time the new revision is created is carried forward to the new revision, anchored to the corresponding block in the new revision.

The carry-forward mechanism handles block identity matching by block ID. If a block was deleted between the published snapshot and the start of the new revision (which cannot happen since the new revision is forked directly from the snapshot), the comment is treated as orphaned — see Section 7.5.

The carry-forward prompt is presented at revision creation time: *"The previous revision has [n] unresolved comment thread(s). Carry them forward to this revision?"* The owner can review the list before confirming.

### 7.4 Threading Model

Comment threads are **flat within a block** — one thread per comment, with replies nested one level deep. Infinite nesting is not supported. This is the right model for a document review context: the goal is to resolve a specific point of feedback, not to conduct a multi-party discussion with complex branching.

**Thread resolution:** Threads are resolved, not deleted. A resolved thread collapses to a single-line summary in the editor margin. Resolved threads are accessible via a "Show resolved" toggle. The resolution is part of the audit record — who resolved it and when.

**Who can resolve a thread:** The person who created the comment thread, the document owner, or any assigned approver. This is intentional — an approver who has addressed a point they raised should be able to resolve their own thread without requiring the author to do it.

### 7.5 Comment Orphaning

A comment thread enters an **orphaned** state when its anchor is no longer valid. Two events can orphan a thread:

**Block regeneration** — when a block is regenerated because a linked spec field changed and the owner accepted the auto-update. All comment threads anchored to that block (both block-level and text-range threads) enter orphaned state. The regenerated block may have substantially different prose — no anchor is safe to preserve.

**Targeted text edit or deletion** — when a reviewer has anchored a comment to a specific text span (`anchor_type: 'text_range'`) and the writer subsequently edits or deletes the anchored text. Orphaning is triggered when the anchored text span can no longer be matched in the block's current content. The match check uses both character offsets and the `anchor_text` snapshot: if the text at the stored offsets no longer matches `anchor_text`, the thread is orphaned. This prevents a comment that was anchored to "rated at 36 V" from silently moving when the text changes to "rated at 48 V" — the comment should be reviewed, not auto-re-anchored.

Block-level threads are never orphaned by text edits — only by block regeneration or block deletion.

Orphaned threads are:
- Visually flagged in the editor with a distinct indicator ("Comment anchor no longer valid — block was regenerated" or "Anchored text was edited")
- Moved to a "Detached comments" section below the document body
- Preserved in full and accessible; not deleted

The document owner reviews detached comments and decides whether to re-anchor them (if the feedback is still relevant), resolve them (if the change addressed the point), or dismiss them.

Silently archiving comment threads would create trust issues in teams where reviewers expect their feedback to be visible until explicitly addressed. The orphaned state makes the situation unambiguous and actionable.

### 7.6 Published Document Commenting

Workspace members with internal access can comment on a Published document. When a comment is added to a Published document, Arther surfaces a prompt to the document owner: *"You're commenting on a published document. Would you like to create a new revision?"*

The prompt is advisory — the comment is saved regardless of whether the owner creates a revision. This supports the common scenario where a team member notices an issue on the portal and wants to leave a note before formally starting a new revision.

Published document comments are visible to internal workspace members only, not to portal visitors.

### 7.7 Portal Visitor Commenting

Portal visitor commenting — allowing customers, distributors, or sales engineers to leave feedback on published documents — is explicitly out of scope for launch. It is a named post-launch feature. The scope expansion is significant: visitor commenting requires moderation tooling, spam handling, a routing mechanism into the internal review workflow, and decisions about visibility and identity verification that are not warranted before the core workflow is validated.

---

## 8. Mentions

The `@mention` system works in every comment input surface across the product: document block comments, spec field comments (Feature 1), and review brief messages. Mentions resolve to workspace members only — external parties cannot be mentioned.

When a workspace member is mentioned, they receive a notification regardless of their role on the document or spec field. The notification includes full context about where the mention occurred:

- *"[Name] mentioned you in a comment on [Block description] in [Document name]"*
- *"[Name] mentioned you in a comment on [Field name] in [Product name]"*

The context is actionable without opening the app. Clicking the notification navigates directly to the specific comment thread.

---

## 9. Notification Architecture

### 9.1 Unified Notification System

The notification system is a product-wide infrastructure — not scoped to the Collaboration & Review feature alone. Two categories of events generate notifications, and they share a single delivery model, preference model, and notification centre UI:

**Collaboration events** — state transitions, approval actions, comments, mentions (specified in this document)

**Spec staleness events** — field value changes affecting documents, bulk staleness thresholds (specified in Feature 4: Smart Spec Tracking)

Designing both categories into one system from the start avoids the two-model problem that arises when staleness notifications are retrofitted onto a collaboration-only notification infrastructure. The notification centre becomes a unified activity feed for everything that requires a workspace member's attention.

### 9.2 Event Taxonomy

**State transition events:**

| Event | Recipients |
|---|---|
| Document sent for Review | All assigned approvers for this Document Type |
| Document approved (all approvers) | Document owner |
| Document rejected (sent back) | Document owner |
| Document published | Document owner + any workspace member who commented on the revision |
| Revision created | Approvers who participated in the previous revision's review |

**Comment and mention events:**

| Event | Recipients |
|---|---|
| Comment added to your document | Document owner |
| Reply added to a comment thread you're in | All participants in that thread |
| @mention | Mentioned person |

**Due date events:**

| Event | Recipients |
|---|---|
| Review due date reached | Every approver with Pending or Commented status |
| Review due date passed (day after) | Document owner — lists outstanding approvers by name |

**Spec staleness events** (defined in Feature 4; delivered through this system):

| Event | Recipients |
|---|---|
| Spec field changed — documents affected | Owners of documents containing stale blocks |
| Spec field commented on | Field owner or assigned watcher |
| Spec field value updated following a comment | Commenter who flagged the field |

### 9.3 Delivery Model

**In-app notification centre** — required at launch. A persistent, paginated feed of all notification events for the signed-in workspace member. Accessible from the main navigation. Supports bulk mark-as-read. Groups related events (e.g. three comments on the same document in quick succession) to reduce noise.

**Email** — required at launch. Hardware documentation teams are not in Arther continuously. Approval requests, rejections, and @mentions that only surface in-app will be missed. Email defaults:
- On by default: Review requested, document rejected, @mention, review overdue
- Off by default: Comment added (non-mention), document published, spec staleness alerts

Email batching: comment events outside of @mentions are batched into a single daily digest rather than one email per comment. State transition and mention events are delivered immediately.

**Slack / Teams integration** — out of scope for launch. Named post-launch integration. Notification payloads are designed to be structured (document name, state, action taken, link) so that a Slack message can surface the key action without requiring the recipient to open Arther.

### 9.4 Notification Preference Model

Two axes at launch:

**Per event type** — each event category (review requests, approvals, rejections, comments, @mentions, staleness alerts) can be toggled on or off independently.

**Per channel** — in-app and email can be toggled independently per event type.

Per-document notification preferences — "only notify me for documents I own" — are a named post-launch addition. At launch, preferences are workspace-wide per user.

### 9.5 External Reviewers

External reviewer access — inviting a contract manufacturer, regulatory consultant, or customer to review a document without being a workspace member — is explicitly out of scope for launch. It is a named post-launch feature requiring dedicated design work: guest identity model, scoped document access, seat vs. guest billing model, and security review of document sharing with external parties.

The absence of external reviewer access at launch should be explicit in product documentation so it is not treated as an accidental omission.

---

## 10. Data Model

### 10.1 Document Revisions

```typescript
interface DocumentRevision {
  id: string
  document_id: string
  revision_number: number         // sequential: 1, 2, 3...
  state: 'draft' | 'review' | 'approved' | 'published'
  created_at: string
  created_by: string
  published_at?: string           // set when state becomes 'published'
  published_by?: string
  review_brief?: string           // optional message to reviewers at submission
  review_due_date?: string        // optional due date set at submission
}
```

### 10.2 Approval Role Configuration

```typescript
interface DocumentTypeApprovalRole {
  id: string
  document_type_id: string
  role_label: string              // e.g. "Technical Reviewer", "Regulatory Reviewer"
  display_order: number
}

interface ApprovalRoleAssignment {
  id: string
  role_id: string                 // references DocumentTypeApprovalRole
  workspace_member_id: string
  assigned_at: string
  assigned_by: string             // workspace admin who made the assignment
}
```

### 10.3 Approval Records

```typescript
interface ApprovalRecord {
  id: string
  revision_id: string
  role_id: string
  approver_id: string
  action: 'approved' | 'rejected' | 'owner_override'
  reason?: string                 // mandatory for 'rejected'; required for 'owner_override'
  recorded_at: string
  override_on_behalf_of?: string  // for owner_override: the role being overridden
}
```

Approval records are immutable once created. They are never deleted — they form the permanent audit trail. When approvals reset on rejection (Section 3.4), the records are not deleted; a new review cycle begins and subsequent approvals create new records scoped to the new cycle.

### 10.4 Comment Threads

```typescript
interface CommentThread {
  id: string
  revision_id: string
  block_id: string
  anchor_type: 'block' | 'text_range'  // 'block' = whole block; 'text_range' = prose span
  text_anchor?: {                       // set when anchor_type is 'text_range'; null for 'block'
    start_offset: number               // character position of anchor start in block text content
    end_offset: number                 // character position of anchor end (exclusive)
    anchor_text: string                // snapshot of the anchored text at comment creation time;
                                       // used to detect whether the anchored text has changed
  }
  status: 'open' | 'resolved' | 'orphaned'
  orphaned_reason?: 'block_regenerated' | 'text_edited'  // set when status becomes 'orphaned'
  created_by: string
  created_at: string
  resolved_by?: string
  resolved_at?: string
}

interface Comment {
  id: string
  thread_id: string
  parent_comment_id?: string      // null = root comment; set = reply (one level max)
  author_id: string
  body: string                    // rich text; may contain @mention tokens
  created_at: string
  edited_at?: string
}
```

### 10.5 Notifications

```typescript
interface Notification {
  id: string
  recipient_id: string
  event_type: NotificationEventType
  payload: NotificationPayload    // typed union keyed on event_type
  read_at?: string
  created_at: string
}

interface NotificationPreference {
  workspace_member_id: string
  event_type: NotificationEventType
  in_app_enabled: boolean
  email_enabled: boolean
}
```

---

## 11. Design Decisions

| Decision | Rationale |
|---|---|
| Four fixed states at launch; no custom states | Custom states require users to configure which state triggers system behaviour (portal publication, edit locking). This creates support burden and misconfiguration risk before the core workflow is validated. Fixed states ship a predictable, auditable workflow immediately. Custom states are a named post-launch addition. |
| Published is a snapshot tag, not a mutable state | Treating Published as mutable would mean taking a document off the portal to edit it — unacceptable for companies whose sales teams are sharing portal URLs. The working copy model decouples editing from portal availability entirely. |
| Explicit revision creation, not automatic on first edit | Automatic revision creation is invisible and produces no audit record of intent. Explicit creation forces a conscious decision and creates a clean audit moment — "revision 2 was created by [user] on [date] from revision 1." This is meaningful for compliance customers who need to demonstrate intentional change management. |
| Per-Document-Type approval roles, not workspace-wide | The sign-off authority for a technical datasheet is not the same as for an internal process document. Workspace-wide approver roles would give marketing managers the ability to approve regulatory content and vice versa. Per-Document-Type configuration matches organisational reality. |
| AND logic for approvals with owner override | OR logic (any single approver) is too permissive for compliance-sensitive documentation. AND logic ensures the full required review set has been consulted. The owner override with mandatory reason and audit log entry handles genuine emergencies without removing the AND logic as the default. |
| All approvals reset on rejection | Partial approval states create pressure to bypass remaining reviews: "two of three already approved, let's not make them do it again." That undermines the purpose of AND logic. Resetting on rejection is strict but consistent. The minor edit provision for approvers mitigates the main frustration case. |
| Mandatory rejection reason | A rejection without a reason is not useful for a compliance audit. The audit trail entry "Sent back by [Name]" provides no actionable information. One text field is minimal friction for a high-value audit record. |
| One rejection = immediate return, no consensus required | Waiting for all approvers to weigh in before acting on a rejection creates awkward dynamics — approvers may delay their review to avoid being the one who has to formally reject. Immediate return puts the feedback in front of the owner as fast as possible. |
| Review request includes brief, message, and due date | The three-field review brief step — reviewers, message, due date — is the minimum context that makes async review functional. Without it, reviewers receive a notification with no context for what to focus on or when a response is needed. |
| Pre-flight check is advisory, not blocking | A hard block on pre-flight failures would delay time-sensitive document releases due to gaps (placeholder blocks) that may be genuinely unavoidable. The pre-flight check surfaces the issues; the owner decides whether to proceed. The gate is at the approval stage, not the submission stage. |
| Revision-scoped comments with unresolved carry-forward | Document-scoped comments would show revision 1 threads to revision 2 reviewers, creating confusion about what has and hasn't been addressed. Revision-scoped comments start each review cycle clean. Unresolved carry-forward ensures feedback that was never addressed isn't silently dropped. |
| Comment orphaning with visual flag, not silent archival | Silently archiving comments when their anchor block is regenerated would undermine reviewer trust — their feedback appears to have vanished without being addressed. The orphaned state preserves the comment and forces the owner to make an explicit decision about each one. |
| Text-range anchoring for prose blocks, block-level for all others | Text-range anchoring provides precision for the most common review scenario — giving feedback on specific language in prose. Non-prose blocks (Spec Tables, images, containers) do not have text spans that can be independently referenced, so block-level anchoring is both necessary and sufficient for them. Offering text-range anchoring on all block types would require comment attachment semantics for every block type's internal structure, which adds complexity without proportionate value. |
| Text-edit orphaning uses anchor_text snapshot for match detection | Character offsets alone are not sufficient to detect whether the anchor has moved — a deletion before the anchor shifts all subsequent offsets. `anchor_text` provides a semantic check: if the text at the stored offsets no longer matches the original span, the anchor is stale. This is more robust than offset-only comparison and avoids the false confidence of an offset that happens to fall on a different word after an edit. |
| Unified notification system for collaboration and staleness | Spec field changes (Feature 4) and document state changes (this feature) both require the same delivery infrastructure, preference model, and notification centre UI. Designing them separately would produce two inconsistent systems. A unified system is more maintainable and presents a coherent experience to workspace members. |
| External reviewers are out of scope for launch | External reviewer access requires a guest identity model, scoped document access, security review, and billing model decisions. These are non-trivial and should not be designed under pressure to ship the core review workflow. The absence is documented explicitly so it is not treated as an oversight. |
| Portal visitor commenting is out of scope for launch | Visitor commenting requires moderation tooling, spam handling, and routing mechanisms that go significantly beyond the internal review workflow. It is a distinct product surface and should be scoped independently once the core workflow is validated. |

---

*Arther — Collaboration & Review: Feature Specification. Version 1.1, May 2026. Greenfield specification covering the document state machine, working copy and revision model, approval and permission model, review request and rejection flows, block-level and text-range comment anchoring model, mention system, and notification architecture. CommentThread extended with sub-block text-range anchoring (`anchor_type`, `text_anchor`) and orphaning now triggered by both block regeneration and targeted text edit. All design decisions documented with rationale. External reviewer access and portal visitor commenting are explicitly parked as named post-launch features. Intended as the authoritative design reference for this feature bucket, independent of implementation sequencing or sprint planning.*
