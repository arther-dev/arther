# Arther — Offline & Degraded Connectivity Model

**Version:** 1.0
**Date:** May 2026
**Status:** Specification complete — greenfield design

---

## 1. Overview

### 1.1 Philosophy

Arther is a connected product. Its core workflows — AI generation, spec synchronisation, review and approval, portal publication — are inherently online operations that cannot be meaningfully performed without a server connection. Arther does not attempt to be an offline-first product.

What it does guarantee is that a user who loses connectivity mid-session does not lose work in progress, and that the connectivity state is always visible so users are never surprised by a failed save.

### 1.2 Scope

This document defines how Arther behaves when a user's internet connection is lost or degraded: what continues to work, what is blocked, how in-progress edits are protected, and how the system recovers when connectivity is restored. It covers both the editor experience and the published portal.

---

## 2. Connectivity Indicator

A persistent **connectivity indicator** is displayed in the editor interface at all times. It has three states:

| State | Display | Meaning |
|---|---|---|
| **Connected** | Green dot — "Saved" | All changes are synced to the server. Auto-save is active. |
| **Saving** | Animated indicator — "Saving…" | A save is in progress. Changes are in the local queue awaiting server confirmation. |
| **Offline** | Red dot — "Offline — changes saved locally" | Connection is lost. Edits are being held in the local save queue and will sync when connection restores. |

The indicator is always visible — not hidden in a menu or tooltip — so users always know the state of their work without having to check.

---

## 3. Editor Behaviour

### 3.1 Local Save Queue

The Block Editor uses a **local save queue** to protect in-progress edits during connectivity loss. When the user makes changes, those changes are written to the local queue immediately. The queue drains to the server in the background as auto-save intervals fire.

If connectivity is lost before a save completes:
- The local queue retains all unsaved changes in the browser
- The connectivity indicator switches to the Offline state
- The editor remains fully editable — the user can continue working
- Changes accumulate in the local queue

When connectivity is restored:
- The queue drains automatically — no user action required
- All queued changes are sent to the server in order
- The connectivity indicator returns to Connected / Saved
- The user is not prompted or interrupted unless a conflict is detected (see §3.2)

### 3.2 Conflict Resolution on Reconnect

If the same block was edited by another workspace member while the current user was offline, a conflict exists between the server state and the local queue. On reconnect, the system detects the conflict and presents the affected blocks to the user with a simple choice: **keep your version** or **use the server version**. Conflict resolution is block-level, not document-level — each conflicting block is resolved independently.

In practice, simultaneous editing of the same block by two users is unlikely given that Arther does not support real-time collaborative editing (Google Docs–style simultaneous cursors are explicitly out of scope for v1). Conflicts are an edge case, not an expected workflow.

### 3.3 Operations Blocked Offline

The following operations require a live server connection and are blocked when the user is offline. Each displays a clear inline message explaining why the action is unavailable and that it will be available when connectivity is restored:

| Operation | Reason |
|---|---|
| AI document generation | Requires LLM provider call |
| Block regeneration | Requires LLM provider call |
| Send for Review | Requires server state transition and notification delivery |
| Approve / Reject | Requires server state transition and audit record |
| Publish | Requires portal snapshot creation |
| Invite workspace member | Requires server-side invitation creation and email delivery |
| Workspace settings changes | Requires server write |

---

## 4. Portal Behaviour

### 4.1 Browser Caching

The published portal serves static HTML snapshots. Standard browser caching applies — documents a visitor has already loaded are cached by the browser and may be viewable if the visitor loses connectivity after the initial load. No dedicated offline infrastructure (service workers, offline-first architecture) is built for the portal at v1.

This is sufficient for Arther's use case. Portal visitors are typically viewing documentation in a professional context (evaluating a product, following an installation procedure) where connectivity is generally available. The genuine offline use case — a sales engineer presenting at a customer site with no wifi — is covered by PDF download, which produces a file the user can open without any internet connection.

### 4.2 No Offline Portal Infrastructure at v1

Service worker caching and offline-first portal architecture are explicitly out of scope for v1. They can be added post-launch if portal analytics reveal significant offline access patterns (detectable via failed network requests in browser error logs, or user feedback).

---

## 5. Design Decisions

| Decision | Rationale |
|---|---|
| Local save queue rather than read-only offline mode | A read-only editor on connectivity loss risks losing work if the user's session expires before they reconnect. The local save queue ensures that edits made during an outage are preserved regardless of session state. The implementation cost is modest given that auto-save already batches changes. |
| Editor remains editable offline | Blocking editing on connectivity loss is unnecessarily restrictive for what is typically a brief outage. Users who are in the middle of a paragraph should not be frozen out of their work because of a network hiccup. |
| Connectivity indicator always visible | Hidden connectivity state creates mistrust. Users who are unsure whether their changes are saved develop workarounds (manual saves, keeping notes elsewhere) that undermine the product. An always-visible indicator is a low-cost, high-trust feature. |
| PDF download as the offline portal solution | Building a dedicated offline portal is significant infrastructure for a use case that is naturally served by a format users already understand. PDF is universally supported, truly offline, and already part of Arther's export model. |
| No real-time conflict detection | Arther does not support simultaneous editing. The conflict scenario on reconnect is an edge case that does not justify a more sophisticated operational transform or CRDT-based approach at v1. Block-level accept/reject resolution is proportionate to the actual risk. |

---

*Arther — Offline & Degraded Connectivity Model. Version 1.0, May 2026. Arther is a connected product. In-progress editor changes are protected by a local save queue that drains to the server on reconnect. The connectivity state is always visible. Operations requiring server connectivity (generation, review, publish) are blocked offline with clear messaging. The portal relies on browser caching; PDF download covers the genuine offline use case. No offline-first infrastructure at v1.*
