# Arther — Analytics Event Model

**Version:** 1.0
**Date:** May 2026
**Status:** Specification complete — greenfield design

---

## 1. Overview

### 1.1 Purpose

This document defines the analytics events that Arther captures from v1, the surfaces where analytics data is presented, and the minimum data model required to instrument the product correctly from launch. It is not a full analytics platform specification — it does not specify the analytics backend, data warehouse, or query layer. Its purpose is to establish what is measured and where it appears so that instrumentation decisions are made intentionally rather than retrofitted after launch.

### 1.2 Two Analytics Domains

Arther captures events across two distinct domains:

**Portal consumption analytics** — how external visitors (customers, distributors, sales engineers) interact with published documents on the portal. This data is most valuable to document owners and workspace admins who want to understand whether their documentation is being read and by whom.

**Workspace analytics** — how the internal team uses Arther: document generation rates, review workflow health, and spec staleness across the workspace. This data is most valuable to workspace admins managing documentation operations.

### 1.3 Visitor Identity Model

Portal visitor identity depends on the document's access configuration:

**Public documents** — accessible without authentication. Visitors are anonymous. Analytics are session-based: Arther assigns a session ID to each browser session and groups events by session. No personal identity is captured or inferred.

**Restricted documents** — require a magic link for access. Visitors are identified by their magic link. Arther associates events with the magic link recipient identifier (the email address or contact name the link was issued to), enabling named consumption analytics: "Acme Corp viewed this datasheet four times this week."

This distinction runs through the portal consumption event model. Events on public documents carry a `session_id` only. Events on restricted documents carry both a `session_id` and a `magic_link_id` that resolves to a recipient identity.

---

## 2. Analytics Surfaces

Analytics data is presented in three locations:

### 2.1 Per-Document Consumption Panel (Editor)

When a document owner opens a published document in the editor, a **stats panel** is accessible in the document sidebar. It displays consumption data for that specific document: view count, unique visitors, download count, and — for restricted documents — a list of identified viewers with timestamps.

This is the primary surface for document owners who want to understand how a specific document is performing.

### 2.2 Consumption Analytics (Admin Panel)

A dedicated **Consumption** section in the workspace admin panel displays portal consumption data across all published documents in a single view. This enables workspace admins to compare document performance, identify the most and least accessed documents, and spot search queries that are returning no results.

This section is visible to Owners and Admins only.

### 2.3 Workspace Analytics (Admin Panel)

A dedicated **Workspace** section in the admin panel displays team productivity and document health data: generation success rates, review cycle times, rejection rates by document type, and workspace-wide staleness counts.

This section is visible to Owners and Admins only.

---

## 3. Portal Consumption Events

### 3.1 Event Definitions

#### `document_viewed`

Fired when a portal visitor loads a published document page.

| Field | Type | Description |
|---|---|---|
| `event_type` | `'document_viewed'` | — |
| `document_id` | string | The published document |
| `revision_id` | string | The specific published revision served |
| `variant_id` | string \| null | The variant viewed, if applicable |
| `session_id` | string | Browser session identifier |
| `magic_link_id` | string \| null | Set for restricted documents; null for public |
| `occurred_at` | string | ISO 8601 timestamp |

One event is fired per page load. Returning to the same document in the same browser session fires a new event.

#### `document_downloaded`

Fired when a portal visitor initiates a PDF download.

| Field | Type | Description |
|---|---|---|
| `event_type` | `'document_downloaded'` | — |
| `document_id` | string | — |
| `revision_id` | string | — |
| `variant_id` | string \| null | — |
| `session_id` | string | — |
| `magic_link_id` | string \| null | — |
| `occurred_at` | string | — |

#### `portal_searched`

Fired when a portal visitor submits a search query.

| Field | Type | Description |
|---|---|---|
| `event_type` | `'portal_searched'` | — |
| `query` | string | The search string entered |
| `results_count` | number | Number of results returned (0 = zero-result search) |
| `session_id` | string | — |
| `occurred_at` | string | — |

### 3.2 Derived Metrics

From the three portal consumption events, the following metrics are derived:

| Metric | Derivation |
|---|---|
| Total views | Count of `document_viewed` events per document |
| Unique visitors | Count of distinct `session_id` values per document |
| Identified viewers | Count of distinct `magic_link_id` values (restricted docs only) |
| Download count | Count of `document_downloaded` events per document |
| Download rate | `document_downloaded` count ÷ `document_viewed` count |
| Variant breakdown | Views grouped by `variant_id` |
| Top search queries | Most frequent `query` values across `portal_searched` events |
| Zero-result searches | `portal_searched` events where `results_count = 0` |

---

## 4. Workspace Analytics Events

### 4.1 Event Definitions

#### `document_generated`

Fired when the AI Document Generator completes a generation attempt, whether successful or not.

| Field | Type | Description |
|---|---|---|
| `event_type` | `'document_generated'` | — |
| `document_id` | string | The document produced |
| `document_type_id` | string | The Document Type used |
| `product_id` | string | The product the document was generated for |
| `success` | boolean | Whether generation completed without error |
| `failure_reason` | string \| null | Set when `success = false` |
| `blocks_generated` | number | Number of blocks in the output |
| `duration_ms` | number | Generation time in milliseconds |
| `triggered_by` | string | Workspace member ID |
| `occurred_at` | string | — |

#### `document_state_changed`

Fired on every document state transition: Draft → Review, Review → Draft (pull back or rejection), Review → Approved, Approved → Published, and Published → Draft (via Create Revision).

| Field | Type | Description |
|---|---|---|
| `event_type` | `'document_state_changed'` | — |
| `document_id` | string | — |
| `revision_id` | string | — |
| `from_state` | `'draft' \| 'review' \| 'approved' \| 'published'` | — |
| `to_state` | `'draft' \| 'review' \| 'approved' \| 'published'` | — |
| `trigger` | `'submission' \| 'approval' \| 'rejection' \| 'pull_back' \| 'publish' \| 'revision_create'` | What caused the transition |
| `triggered_by` | string | Workspace member ID |
| `rejection_reason` | string \| null | Set when `trigger = 'rejection'` |
| `approver_role_id` | string \| null | Set when `trigger = 'approval'` or `'rejection'` |
| `occurred_at` | string | — |

#### `block_regenerated`

Fired when a single block is regenerated, either manually by the user or automatically following a spec field change.

| Field | Type | Description |
|---|---|---|
| `event_type` | `'block_regenerated'` | — |
| `document_id` | string | — |
| `block_id` | string | The block that was regenerated |
| `trigger` | `'manual' \| 'spec_change'` | What initiated regeneration |
| `spec_field_id` | string \| null | Set when `trigger = 'spec_change'` |
| `triggered_by` | string | Workspace member ID (manual) or system (spec_change) |
| `occurred_at` | string | — |

#### `spec_field_updated`

Fired when a spec field value is changed in the Spec Database.

| Field | Type | Description |
|---|---|---|
| `event_type` | `'spec_field_updated'` | — |
| `field_id` | string | The spec field that changed |
| `product_id` | string | — |
| `component_id` | string \| null | Set if the field belongs to a component |
| `updated_by` | string | Workspace member ID |
| `source` | `'manual' \| 'sync'` | Manual edit or External Sync (post-launch) |
| `occurred_at` | string | — |

### 4.2 Derived Metrics

| Metric | Derivation |
|---|---|
| Generation success rate | `document_generated` events where `success = true` ÷ total, per document type |
| Average generation time | Mean `duration_ms` across `document_generated` events |
| Average review cycle time | Time between `from_state = 'draft', to_state = 'review'` and `from_state = 'review', to_state = 'approved'`, per revision |
| Rejection rate | `document_state_changed` events with `trigger = 'rejection'` ÷ total review submissions, per document type |
| Most common rejection reasons | `rejection_reason` text frequency across rejection events |
| Spec update frequency | Count of `spec_field_updated` events per field, per product |
| Block regeneration rate | `block_regenerated` events per document, split by `trigger` |
| Stale document count | Derived from Smart Spec Tracking state, not from analytics events — surfaced in Workspace analytics as a live count |

---

## 5. Data Model

### 5.1 Shared Event Envelope

All analytics events share a common envelope:

```typescript
interface AnalyticsEvent {
  id: string                        // unique event ID
  workspace_id: string
  event_type: AnalyticsEventType
  payload: AnalyticsEventPayload    // typed union keyed on event_type
  occurred_at: string               // ISO 8601
  ingested_at: string               // when Arther's backend recorded it
}

type AnalyticsEventType =
  | 'document_viewed'
  | 'document_downloaded'
  | 'portal_searched'
  | 'document_generated'
  | 'document_state_changed'
  | 'block_regenerated'
  | 'spec_field_updated'
```

### 5.2 Magic Link Recipients

```typescript
interface MagicLink {
  id: string
  document_id: string
  recipient_email: string
  recipient_name?: string
  created_by: string                // workspace member who issued the link
  created_at: string
  expires_at?: string               // null = no expiry
  revoked_at?: string
}
```

Analytics events reference `magic_link_id`, which resolves to a `MagicLink` record, giving the consumption analytics surface a named identity for each restricted document viewer.

---

## 6. Design Decisions

| Decision | Rationale |
|---|---|
| Session-based identity for public documents, magic link identity for restricted | Public documents are intentionally open — capturing personal identity without consent is inappropriate and legally complex. Magic link recipients have already been explicitly identified by the workspace admin who issued the link, so associating their views with their identity is expected and appropriate. |
| `document_state_changed` covers all transitions rather than separate events per transition | A single event type with `from_state` and `to_state` fields keeps the event taxonomy small and makes querying the full lifecycle of a revision straightforward. Filtering on `trigger` distinguishes rejections from pull-backs, which is the meaningful business distinction. |
| Stale document count is a live count, not an analytics event | Staleness is a point-in-time state derived from the Smart Spec Tracking system. Treating it as an analytics event would produce an ever-growing event log with no clear semantics (a document is stale until it isn't — there is no single moment it becomes stale). The Workspace analytics surface reads the current staleness state directly. |
| `spec_field_updated` captures the source field for post-launch External Sync | When External Sync ships, spec field changes will arrive from Arena PLM as well as manual edits. The `source` field distinguishes these from day one, so the Workspace analytics surface can split spec activity by source without a schema change. |
| Zero-result searches captured in `portal_searched` | Zero-result searches are a direct signal that visitors are looking for content Arther does not have or that portal search is not surfacing correctly. They are among the most actionable analytics signals for documentation teams. |
| No scroll depth or section engagement tracking at v1 | Section-level engagement requires instrumenting the portal renderer with scroll listeners and intersection observers. This is non-trivial and the derived insight (which section gets read) is useful but not critical. Page-level views and downloads answer the primary question — is this document being consumed — without the implementation overhead. Named post-launch addition. |

---

*Arther — Analytics Event Model. Version 1.0, May 2026. Defines the seven analytics events captured from v1, the three surfaces where analytics data is presented, and the minimum data model required for correct instrumentation. Portal consumption analytics distinguish between anonymous (public documents) and identified (restricted documents via magic link) visitors. Workspace analytics cover document generation health, review workflow metrics, and spec activity. Full analytics backend, data warehouse, and query layer are outside the scope of this document.*
