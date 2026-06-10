# Arther — External Sync: Feature Specification

**Version:** 1.1
**Date:** May 2026
**Status:** Deferred — post-launch feature. Architecture specified for design completeness; not scheduled for v1 build.

**Changelog:**
- **v1.1** — Feature explicitly deferred post-launch; resolved adapter strategy (first-party bespoke adapters, no integration platform) and launch integration list (Arena PLM as first planned integration)

---

> **⚠ Deferred post-launch.** External Sync is not part of the v1 build scope. The SpecReconciler abstraction is referenced in the Spec Database architecture (the `provenance`, `sync_source_id`, and `last_synced_at` fields on `SpecField` are reserved for this feature), but no adapters, reconciler service, or admin UI will be built at launch. Arena PLM is the planned first integration when this feature is picked up post-launch. This document is retained as the authoritative design reference for that future build.

---

## 1. Overview

### 1.1 Purpose

External Sync is the integration layer that connects Arther's Spec Database to the ERP and PLM systems where hardware companies already store product data. It enables spec values — electrical parameters, mechanical dimensions, compliance certifications, performance curves — to flow from those systems into Arther automatically, keeping the Spec Database current without manual re-entry.

Hardware companies maintain product data across Arena, Duro, Windchill, PTC, custom ERP configurations, and legacy systems. Before Arther, keeping documentation in sync with that data required a human manually reconciling two sources of truth — a process that breaks down under any release pressure. External Sync replaces that manual reconciliation loop with an automated, auditable pipeline that routes human attention only to changes that genuinely require a decision.

### 1.2 Core Architecture: The SpecReconciler

The SpecReconciler is the shared service at the centre of this feature. It receives a normalised set of mutation records — regardless of whether they arrived via webhook push, scheduled pull, or manual file trigger — and applies them to the Spec Database according to a consistent set of rules.

The SpecReconciler was introduced as an abstraction in the Spec Database feature document, where it is responsible for both CSV import and webhook sync. This document expands that design into a full integration architecture: how payloads reach the reconciler, how mutations are classified and applied, how conflicts are detected and resolved, and how admins monitor and manage the integration over time.

The key principle: **the reconciler's logic is identical regardless of source.** An incoming webhook payload and a manually uploaded CSV file produce the same canonical mutation records and flow through the same classification and application pipeline. A single well-tested service is more reliable than parallel implementations that diverge over time.

### 1.3 Role in Arther

External Sync is upstream of the Spec Database and downstream of the ERP/PLM systems in a hardware company's toolchain. Its connections to the rest of Arther:

- **Spec Database** — all mutations produced by External Sync are applied as field value changes, field additions, or structural changes to the Spec Database. The Spec Database's versioning system records these changes identically to manual edits — their sync origin is logged but they are otherwise indistinguishable in the version history.
- **Smart Spec Tracking** — when a field value changes via sync, the staleness cascade fires identically to a manual edit. External Sync does not touch document content; that is staleness tracking's responsibility.
- **Collaboration & Review** — conflict queue items and sync anomaly alerts route through the unified notification system specified in Feature 6.
- **Enterprise (Feature 10)** — the Integration Manager role defined in the permission model here is a placeholder that Feature 10 will flesh out.

---

## 2. Who Uses This

**Workspace Admin** — the primary actor for integration configuration. Sets up sync sources, configures intake mode and conflict policy, runs dry-runs, reviews Tier 3 mutations, and monitors overall sync health via the event log. This is a technical role in practice — the person who knows how the ERP is structured and has the credentials to configure it.

**Domain Owner** — the secondary actor. Receives notifications when Tier 2 mutations affect their field categories, resolves conflicts within their domain, and sees a filtered view of the sync event log scoped to their fields. Does not configure integrations. The domain ownership model is defined in the Smart Spec Tracking feature document.

**Document Owner** — a passive downstream actor. Receives staleness notifications when sync-driven field changes affect their documents, exactly as they would for manual spec edits. Has no direct interaction with the sync infrastructure.

---

## 3. Data Model

### 3.1 SyncSource

A configured integration between Arther and an external system. One workspace can have multiple sync sources — for example, Arena for component specs and a custom ERP for pricing and availability data.

```typescript
interface SyncSource {
  id: string
  workspace_id: string
  name: string                        // human label: "Arena - Motor Product Line"
  intake_mode: 'webhook' | 'scheduled_pull' | 'manual'
  schedule_interval_hours?: number    // for scheduled_pull; minimum 1, default 24
  conflict_policy: ConflictPolicy     // workspace-level default; overridable per field
  webhook_secret_hash?: string        // for webhook intake; hashed, never stored plaintext
  api_credential_ref?: string         // for scheduled_pull; reference to secrets manager
  last_connected_at?: string
  last_sync_run_id?: string
  status: 'active' | 'paused' | 'error' | 'disconnected'
  created_at: string
  created_by: string
}

type ConflictPolicy = 'arther_wins' | 'erp_wins' | 'always_surface'
```

### 3.2 SyncBaseline

The last successfully synced value for each field that has ever been touched by a sync. This is the reference point the reconciler diffs against — not the current Arther value. Storing the baseline separately enables detection of the true conflict condition: both Arther and the ERP have independently moved from the last known shared state.

```typescript
interface SyncBaseline {
  id: string
  sync_source_id: string
  field_id: string
  last_synced_value: FieldValue       // the value at the time of last successful sync
  last_synced_at: string
  last_sync_run_id: string
}
```

The `SyncBaseline` record is created on the first successful sync of a field and updated on every subsequent successful sync. It is preserved even for fields that have since been manually edited in Arther — this is the record needed to detect genuine conflicts and, in the future, to support two-way sync without migration.

### 3.3 MutationRecord

The canonical representation of a single change within a sync payload, produced by the adapter layer before the reconciler processes it.

```typescript
interface MutationRecord {
  id: string
  sync_run_id: string
  sync_source_id: string
  payload_type: 'diff' | 'snapshot'

  mutation_type: MutationType
  entity_type: 'product' | 'component' | 'field'

  arther_entity_id?: string           // null if entity is new or unmatched
  external_id: string                 // the ERP's stable identifier for this entity
  parent_external_id?: string         // for components: the ERP ID of the parent assembly

  field_name?: string                 // for field mutations: name as ERP knows it
  previous_value?: FieldValue         // for diff payloads; null for additions
  new_value?: FieldValue
  unit_hint?: string                  // raw unit string from ERP; adapter maps to unit_id

  tier: 1 | 2 | 3                    // set by the reconciler during classification
  outcome: MutationOutcome
  outcome_reason?: string             // populated when outcome is 'suppressed' or 'held'
}

type MutationType =
  | 'value_update'
  | 'field_add'
  | 'field_delete'
  | 'field_rename'
  | 'field_type_change'
  | 'component_add'
  | 'component_delete'
  | 'component_move'
  | 'product_add'
  | 'product_delete'
  | 'table_row_add'
  | 'table_row_update'
  | 'table_column_add'

type MutationOutcome =
  | 'applied'         // auto-applied (Tier 1)
  | 'notified'        // applied with domain owner notification (Tier 2)
  | 'held'            // queued for admin confirmation (Tier 3)
  | 'suppressed'      // not applied; reason in outcome_reason
  | 'conflict'        // genuine conflict detected; routed to conflict queue
```

### 3.4 SyncRun

A record of a single reconciler execution, whether triggered by webhook, schedule, or manual action.

```typescript
interface SyncRun {
  id: string
  sync_source_id: string
  triggered_by: 'webhook' | 'schedule' | 'manual' | 'dry_run'
  triggered_by_user_id?: string       // for manual triggers and dry-runs

  started_at: string
  completed_at?: string
  status: 'running' | 'completed' | 'failed' | 'dry_run_complete'

  payload_type: 'diff' | 'snapshot'
  raw_payload_ref: string             // reference to raw payload stored in object storage

  mutation_counts: {
    total: number
    tier_1_applied: number
    tier_2_notified: number
    tier_3_held: number
    suppressed: number
    conflicts: number
    errors: number
  }

  staleness_impact: {
    fields_changed: number
    documents_affected: number
    blocks_flagged: number
  }
}
```

### 3.5 ConflictQueueItem

A detected conflict awaiting resolution. Created when the reconciler identifies that both the ERP and Arther have independently diverged from the sync baseline.

```typescript
interface ConflictQueueItem {
  id: string
  sync_run_id: string
  sync_source_id: string
  field_id: string
  mutation_record_id: string

  baseline_value: FieldValue          // last_synced_value at time of conflict detection
  arther_value: FieldValue            // current value in Arther
  erp_value: FieldValue               // incoming value from ERP

  conflict_type: 'value' | 'variant_override' | 'type_change'
  assigned_to_user_id: string         // domain owner; falls back to document owner
  created_at: string
  escalated_at?: string               // set when escalated to workspace admin
  resolved_at?: string
  resolved_by_user_id?: string
  resolution: 'accept_erp' | 'keep_arther' | 'manual_value' | null
  resolved_value?: FieldValue         // for 'manual_value' resolution
  deferred: boolean                   // true if manually deferred in dry-run
}
```

### 3.6 EntityMapping

The stored link between an ERP entity ID and an Arther entity, established during the initial integration setup and used by the reconciler on all subsequent syncs.

```typescript
interface EntityMapping {
  id: string
  sync_source_id: string
  external_id: string
  external_name: string               // name as the ERP reported at mapping time
  arther_entity_type: 'product' | 'component'
  arther_entity_id: string
  mapped_at: string
  mapped_by_user_id: string
}
```

---

## 4. Adapter Layer

The adapter layer sits between the external system and the SpecReconciler. Its job is to accept whatever format the ERP or PLM sends and produce canonical `MutationRecord` objects that the reconciler can process without knowing anything about the source system.

### 4.1 Intake Modes

**Mode 1 — Webhook Push.** The external system sends a payload to Arther's webhook endpoint when something changes. The adapter validates the HMAC signature, parses the payload, and immediately produces mutation records for the reconciler. This is the highest-fidelity intake mode — changes propagate in near real-time. No schedule configuration is needed.

**Mode 2 — Scheduled Pull.** Arther polls the external system's API on a configurable schedule. The adapter authenticates with the stored credential, fetches the current state or delta from the ERP's API, and produces mutation records. The schedule is configurable with a minimum interval of one hour and a default of 24 hours. Scheduled pull is the appropriate intake mode for systems that have a queryable API but cannot initiate outbound webhook connections.

**Mode 3 — Manual Trigger.** A workspace admin initiates a sync from Arther's UI, either by uploading a file or by clicking "Sync now" against a configured pull integration. This covers systems that cannot be polled programmatically and require a human-initiated export-and-upload workflow. Manual trigger shares the same reconciler path as scheduled pull — the distinction is only in how the adapter receives the payload.

All three intake modes produce the same canonical `MutationRecord` schema. The reconciler is not aware of which intake mode delivered the payload.

### 4.2 Payload Types

**Diff payloads** describe what changed since the last sync. The ERP has computed the delta and sends only the changed entities and fields. The adapter parses the delta directly into mutation records. Most modern cloud PLMs (Arena, Duro) emit diff payloads via webhook.

**Snapshot payloads** describe the complete current state of a product or component set. The adapter compares the incoming snapshot against the `SyncBaseline` records for this source and computes the diff itself, producing the same mutation record format. CSV file uploads and full ERP exports are always snapshot payloads.

The reconciler processes both identically once mutation records are produced. The `payload_type` field on `MutationRecord` and `SyncRun` records the origin for audit purposes but does not affect reconciler behaviour.

### 4.3 Canonical Mutation Schema

The canonical mutation record schema (defined in Section 3.3) is the contract between the adapter layer and the SpecReconciler. Adapters are responsible for:

- Normalising external field names to Arther field names using the stored `EntityMapping`
- Mapping raw ERP unit strings to `unit_id` values from Arther's unit registry; flagging unmapped units as `suppressed` with `outcome_reason: 'unit_not_recognised'`
- Inferring `mutation_type` from the payload structure
- Populating `arther_entity_id` by looking up `EntityMapping` records; leaving it null for unmatched entities
- Recording `payload_type` and `previous_value` where available

Unit inference errors and entity matching failures are recorded as `suppressed` mutation records, not dropped silently. They appear in the sync event log and in the dry-run suppressed items view.

### 4.4 Entity Matching

The reconciler matches incoming ERP entities to Arther entities using `EntityMapping` records. On the first sync from a new integration, no mappings exist and the reconciler cannot automatically match entities.

**Initial mapping — dedicated setup screen.** When a workspace admin configures a new integration, an entity mapping screen presents every entity in the incoming payload alongside suggested matches from the Arther workspace. Suggestions are based on name similarity but are never auto-applied. The admin explicitly confirms each link or creates a new Arther entity. Confirmed mappings are stored as `EntityMapping` records and used for all subsequent syncs.

The mapping screen is a one-time cost per integration. After it is complete, all future syncs resolve entity IDs automatically with zero admin involvement.

**Subsequent syncs.** The reconciler looks up `EntityMapping` by `external_id`. If a match is found, `arther_entity_id` is populated and the mutation is processed normally. If an entity arrives with an `external_id` that has no mapping — for example, a newly created component in the ERP — it is classified as a Tier 2 or Tier 3 mutation (component_add or product_add) and queued for admin review, which includes a link step to match or create the entity in Arther.

**Name drift.** ERP entity names change over time. The `EntityMapping` record stores the `external_name` at mapping time for reference but matches exclusively on `external_id`. Name changes in the ERP do not break existing mappings.

---

## 5. SpecReconciler

### 5.1 Execution Model

When the adapter delivers a set of mutation records to the SpecReconciler, the reconciler executes the following steps in order:

1. **Classify** every mutation record into Tier 1, 2, or 3 based on the mutation taxonomy (Section 5.2)
2. **Detect conflicts** for every Tier 1 value mutation by comparing incoming value, current Arther value, and sync baseline (Section 6.1)
3. **Apply** all Tier 1 mutations that are not in conflict, atomically within a single database transaction
4. **Queue** all Tier 2 mutations and dispatch domain owner notifications
5. **Hold** all Tier 3 mutations pending admin confirmation
6. **Route** all detected conflicts to the conflict queue with domain owner assignment
7. **Write** a `SyncRun` record with complete mutation counts and staleness impact

For snapshot payloads, step 0 precedes all of the above: the reconciler computes the diff by comparing the incoming snapshot against `SyncBaseline` records for this source. The diff produces the mutation records that then enter step 1.

In dry-run mode, steps 3, 4, and 5 are skipped. The reconciler produces the full classified mutation set and staleness impact without writing any changes to the Spec Database. A `SyncRun` record with `status: 'dry_run_complete'` is written for audit purposes.

### 5.2 Mutation Taxonomy

Mutations are classified into three tiers by their destructive potential and the human judgment required to apply them correctly.

**Tier 1 — Safe value mutations.** Changes to field values within already-existing fields. No structural implications. Auto-applied.

| Mutation Type | Example |
|---|---|
| `value_update` on scalar field | Rated Voltage changes from 24 V to 28 V |
| `value_update` on range field | Operating Temp range expands from -20–85 °C to -40–85 °C |
| `value_update` on enum field | Cooling Method changes from Passive to Active |
| `value_update` on boolean field | RoHS Compliant changes from false to true |
| `table_row_update` | A row in the Speed-Torque Curve table changes |
| Field metadata change | `conditions`, `measurement_method`, or `source` attribute changes |

**Tier 2 — Additive structural changes.** New entities or fields arrive that do not exist in Arther. Nothing is broken, but domain owners need to be aware. Applied after notification.

| Mutation Type | Behaviour |
|---|---|
| `field_add` on existing component | Created with type inferred from value; domain owner notified to review type and unit assignment |
| `component_add` | Held in unattached state until admin completes entity mapping; admin notified |
| `table_row_add` | Applied automatically; domain owner notified |
| `table_column_add` | Applied; domain owner notified; Chart blocks linked to this table are flagged for reconfiguration |

**Tier 3 — Destructive structural changes.** Mutations that can break referential integrity, orphan block references, or invalidate published documents. Always held for explicit admin confirmation.

| Mutation Type | Why Tier 3 |
|---|---|
| `component_delete` | May cascade to orphaned block references and published documents; triggers the archive cascade defined in the Spec Database feature document |
| `product_delete` | Same as component deletion at product scope |
| `field_delete` | Field may have active block references; cannot auto-delete |
| `field_rename` | Ambiguous: same field with new name, or deleted field and new field? Admin must decide: merge or treat as separate |
| `field_type_change` | Blocked by the Spec Database when scalar overrides exist; reconciler surfaces as Tier 3 regardless |
| `component_move` | Assembly hierarchy edges change; downstream documents may be structurally affected |
| `product_add` | New products in the workspace are significant administrative events; require admin confirmation |

### 5.3 Tiered Auto-Apply

The reconciler applies mutations according to their tier classification:

**Tier 1** mutations are applied immediately within a single atomic transaction. If any mutation in the transaction fails, the entire transaction is rolled back and the sync run records an error. Successfully applied Tier 1 mutations trigger the staleness cascade in Smart Spec Tracking identically to manual spec edits.

**Tier 2** mutations are applied after the Tier 1 transaction completes. Each Tier 2 mutation generates a notification to the relevant domain owner (or workspace admin if no domain owner is assigned for that field category). The notification includes the mutation type, the affected component and field, and a link to the sync event log entry.

**Tier 3** mutations are not applied. They are logged in the sync event log with `outcome: 'held'` and appear in a dedicated Tier 3 review queue accessible to workspace admins. Each held mutation shows the full mutation detail, the potential downstream impact (blast radius), and Accept / Discard actions.

Conflicts detected among Tier 1 mutations are reclassified to `outcome: 'conflict'` and routed to the conflict queue rather than being applied. They do not block the remaining Tier 1 mutations from applying.

---

## 6. Conflict Resolution

### 6.1 Conflict Definition

A conflict is the condition where **the incoming ERP value differs from the sync baseline AND the current Arther value also differs from the sync baseline**. Both sides have independently moved from the last known shared state. This definition requires the `SyncBaseline` record and distinguishes three distinct situations:

| Incoming vs Baseline | Arther vs Baseline | Classification |
|---|---|---|
| Different | Same | Clean ERP update — apply |
| Same | Different | ERP has not changed; Arther edit is authoritative — no-op |
| Different | Different | **Conflict** — route to conflict queue |
| Same | Same | No change — record as suppressed |

### 6.2 Conflict Types

**Value conflict.** The most common case. An engineer edited a field value in Arther; the ERP subsequently sends a different value. Both diverged from the baseline. Example: baseline 24 V, Arther now 28 V, ERP sends 26 V.

**Variant override conflict.** A product variant holds a scalar override on a base component field. The base component sync sends a new canonical value. The conflict is not between two field edits — it is between a new base value and a variant-specific decision. The sync updates the base canonical value only and does not modify or clear the variant override. The variant owner receives a notification: "The base value for [field] changed from X to Y. Your variant override is Z — still intentional?" Variant override conflicts do not enter the conflict queue; they are handled by notification only.

**Type change conflict.** The ERP sends a field with a different type than Arther holds (e.g., scalar arrives as range). This is already blocked at the Spec Database level when scalar overrides exist. The reconciler classifies all type changes as Tier 3 regardless — a human must confirm the type migration explicitly, and the Tier 3 review queue shows what downstream effects to expect.

### 6.3 Resolution Policies

**Default policy: Arther wins.** The incoming ERP value is not applied. The suppressed value is logged in the sync event log with the reason `conflict_arther_wins`. The domain owner is notified that a conflict was suppressed, so Arther's divergence from the ERP is visible rather than silent.

**Configurable per sync source.** Each `SyncSource` has a `conflict_policy` field: `arther_wins`, `erp_wins`, or `always_surface`. This is the workspace-level default for that integration.

**Configurable per field (future).** Individual spec fields can override the source-level conflict policy. This accommodates fields where the ERP is definitively authoritative (e.g., part numbers, regulatory certifications imported from a compliance system) alongside fields where Arther's editorial judgment should prevail.

**`always_surface` policy.** Neither side auto-wins. Every conflict goes to the conflict queue regardless of which side has the more recent edit. Appropriate for integrations where the ERP and the Arther documentation team have legitimate independent authority over the same field.

### 6.4 Conflict Queue UX

**Routing.** Each `ConflictQueueItem` is assigned to the domain owner for the affected field's category. If no domain owner is configured for that category, the item is assigned to the document owner. If no document owner is identifiable, the item escalates directly to the workspace admin.

**Escalation.** Conflict queue items unresolved after 7 days (configurable at the workspace level, minimum 1 day) are escalated to the workspace admin. Escalation does not transfer ownership — the original domain owner retains the item — but the admin receives a notification and the item appears in their admin conflict view.

**Resolution actions.** For each conflict queue item, the assignee can:
- **Accept ERP value** — applies the ERP's incoming value, updates the sync baseline
- **Keep Arther value** — dismisses the conflict, updates the sync baseline to the current Arther value so the same conflict does not recur on the next sync
- **Set manually** — enters a third value that supersedes both; updates the sync baseline to this value

**Bulk resolution.** When the ERP has sent a mass update affecting many fields of the same type, admins can bulk-resolve: "Accept all ERP values for [field category]." Bulk resolution is scoped to a single sync run and a single field category; it cannot span multiple integrations in one action.

**Queue health indicators.** The conflict queue surface shows:
- Total open conflicts with a breakdown by assignee
- Conflict age distribution — a bar chart showing how many items fall into age buckets (0–2 days, 3–7 days, 8–14 days, 14+ days)
- Conflicts approaching or past the escalation threshold, highlighted distinctly

---

## 7. Dry-Run Mode

### 7.1 Purpose

Dry-run mode executes the full reconciler pipeline — payload ingestion, diff computation, conflict detection, mutation classification — without writing any changes to the Spec Database. It answers three questions before anything is committed:

1. **What will change, and is that what I expected?**
2. **What will not change, and why?**
3. **What downstream damage will this cause?**

Dry-run is available to workspace admins only. It can be triggered against any configured sync source and accepts the same payload inputs as a live sync. For scheduled pull integrations, dry-run fetches a live snapshot from the ERP's API using the stored credential.

### 7.2 Changeset View

The primary view of a dry-run result. Every mutation in the incoming payload, classified by tier, with before-and-after values in plain language.

**Presentation:**
- Summary line at top: "47 changes detected. 41 will auto-apply. 4 need your review. 2 are blocked and require action before they can apply."
- Mutations grouped by tier (Tier 3 first, then Tier 2, then Tier 1), then by component within each tier
- Plain language labels — not internal field IDs or raw JSON. "Rated Voltage on Motor Controller Assembly will change from 24 V to 28 V," not "scalar_value_update on field_id:f9a2b"
- Tier 1 section collapsible — these will auto-apply and can be skimmed by most admins
- Conflicts displayed within the changeset as a distinct category alongside Tier 3: "3 conflicts detected — will be routed to conflict queue"

### 7.3 Suppressed Items View

A section of the dry-run result showing mutations that will not be applied, with the specific reason for each. This is the answer to question 2: what will not change, and why.

Suppression reasons surfaced explicitly:

| Reason | Meaning |
|---|---|
| `no_change` | Incoming value matches the sync baseline — nothing to do |
| `conflict_arther_wins` | Conflict detected; Arther value preserved per policy |
| `unit_not_recognised` | Adapter could not map the ERP's unit string to a `unit_id` |
| `entity_not_matched` | No `EntityMapping` record found for the ERP entity ID |
| `type_mismatch` | Incoming field type differs from Arther's stored type |

Surfacing suppressed items is critical for diagnosing integration problems. An admin expecting a specific field to update but not seeing it in the changeset needs to know whether it was suppressed, and why, rather than assuming the ERP did not send it.

### 7.4 Blast Radius View

For each mutation in the changeset that would trigger staleness flags if applied, dry-run shows the downstream impact: how many document blocks reference the affected field and how many documents contain those blocks.

**At launch:** Counts only. "This change will flag 14 blocks across 6 documents as stale." The document and block counts are links to filtered views in Smart Spec Tracking — not inline document lists.

**Fast follow (post-launch):** Direct links to each affected document from within the dry-run view, so admins can notify document owners before the sync runs.

Blast radius is shown per mutation for Tier 1 changes and as an aggregate impact estimate for Tier 3 held mutations: "Deleting this component will orphan 23 block references across 4 published documents."

### 7.5 Selective Commit

After reviewing a dry-run result, an admin can choose to apply a subset of the changeset rather than the full set. Individual Tier 3 items or detected conflicts can be deferred — excluded from the current commit and held for a future run.

Deferred items are logged in the sync event log as `outcome: 'deferred'` with a reference to the admin who deferred them. They reappear in the next sync run's changeset as if newly received. This prevents dry-run from becoming a binary yes/no gate that admins learn to click through without reviewing.

---

## 8. Sync Event Log

### 8.1 Three-Level Structure

The sync event log is structured for three distinct audiences. The levels are navigated by drilling down from summary to detail.

**Level 1 — Run summary.** One row per sync run. Columns: source name, intake mode, timestamp, duration, outcome (clean / conflicts / errors / blocked), and counts for each tier and staleness impact. This is the health dashboard view — the workspace admin's weekly check. Clicking a row expands to Level 2.

**Level 2 — Mutation detail.** Every mutation record in the run, displayed in the same grouping and plain-language format as the dry-run changeset view. Filterable by tier, entity, field name, and outcome. This is the domain owner's investigative view — searching for a specific field change on a specific date to understand what happened to it and whether it was applied, suppressed, or conflicted.

**Level 3 — Raw payload inspector.** The canonical mutation records produced by the adapter, alongside the original adapter output. Collapsible and clearly labelled as technical detail. This is the debugging view — for diagnosing adapter mapping failures, incorrect unit inference, or entity matching errors. Available to workspace admins only.

### 8.2 Proactive Anomaly Surfacing

The event log surfaces anomalies automatically rather than requiring admins to detect them by reading log entries.

**Sync gap detection.** If a scheduled integration has not run in longer than 2× its configured interval, the integration's status is set to `error` and a workspace admin notification is dispatched. The notification includes the last successful run timestamp and a direct link to the integration configuration. Admins do not need to notice the log went quiet.

**Conflict age escalation.** Conflict queue items unresolved past the workspace's configured escalation threshold (default 7 days) generate an escalation notification to the workspace admin. The event log marks these items with an escalation timestamp visible at Level 2.

**Drift rate trending.** The run summary dashboard shows a trend line for conflicts-per-run over the last 30 days. An upward trend is a signal that Arther and the ERP are diverging — surfaced as a dashboard annotation rather than buried in per-run counts.

**Entity matching failures.** If the reconciler consistently fails to match a specific `external_id` across multiple sync runs, this appears as a persistent integration health warning at Level 1, not just as per-run suppressed item entries. The warning links to the entity mapping screen where the admin can resolve the unmapped entity.

**Credential expiry warnings.** For scheduled pull integrations, if the stored API credential has an expiry date (from OAuth tokens or API keys with configured rotation), a warning surfaces in the event log and as a workspace admin notification 14 days before expiry.

---

## 9. Security & Authentication

### 9.1 Inbound Webhook Authentication

Every webhook intake request is authenticated before the adapter processes it.

**HMAC signature verification.** When a webhook integration is configured, Arther generates a shared secret. The workspace admin enters this secret in the ERP's webhook configuration. The ERP signs each outbound payload with HMAC-SHA256 using this secret and includes the signature in a request header. Arther verifies the signature before passing the payload to the adapter. Requests that fail signature verification are rejected with HTTP 401 and logged in the sync event log.

**Replay attack prevention.** Each webhook payload must include a timestamp in a designated header. Arther rejects payloads where the timestamp is older than 5 minutes. Combined with HMAC verification, this prevents captured payloads from being replayed.

**Secret rotation.** Webhook secrets are rotatable without downtime. The rotation workflow: generate a new secret in Arther, configure it in the ERP, then activate the rotation in Arther. During the activation step, Arther accepts both the old and new secrets simultaneously for a configurable grace period (default 15 minutes, maximum 60 minutes). After the grace period, the old secret is invalidated. The rotation event is logged in the audit trail.

**Webhook secrets** are stored as hashed values in the `SyncSource` record. The plaintext secret is shown exactly once — at generation time — and cannot be retrieved afterward. If lost, the admin must rotate to a new secret.

### 9.2 Outbound Polling Credentials

For scheduled pull integrations, Arther holds credentials for the external system's API.

**Encrypted storage.** Credentials are stored in a secrets manager, not in the main application database. The `SyncSource` record holds only a reference key (`api_credential_ref`) to the secrets manager entry.

**Read-only scope.** Integration setup guidance explicitly requires that API credentials be scoped to read-only access on the ERP system. Arther cannot enforce this technically — it is a configuration requirement communicated clearly in the setup flow with documentation links. Write-scoped credentials are not blocked, but the UI warns that only read access is needed and that broader scope increases security risk.

**Connection test on setup.** Before saving a new credential, the setup flow runs a live connection test — authenticating against the ERP API and fetching a minimal response. The credential cannot be saved if the connection test fails. This surfaces configuration problems immediately rather than at the first scheduled sync.

**Rotation reminders.** Credentials with no configured expiry surface a rotation reminder after 90 days. Credentials with a configured expiry (e.g., OAuth tokens) generate a warning notification to workspace admins 14 days before expiry and an error alert when the credential expires. An expired credential puts the integration into `status: 'error'` until re-authenticated.

### 9.3 Access Control

**Integration configuration** — create, edit, delete, and pause sync sources — is restricted to workspace admins.

**Dry-run** and **manual sync trigger** are restricted to workspace admins.

**Tier 3 mutation review** — the held mutation queue and the Accept/Discard actions — is accessible to workspace admins only.

**Conflict queue resolution** is accessible to domain owners (scoped to their field categories) and workspace admins (scoped to all categories).

**Sync event log** is accessible to workspace admins at all three levels. Domain owners can access Level 1 and Level 2, filtered to field categories they own. Document owners have no access to the sync event log; they receive staleness notifications through Smart Spec Tracking as normal.

**Integration Manager role (future).** The permission model is designed to accommodate a dedicated Integration Manager role in the Enterprise feature tier — a role that holds sync admin permissions (integration configuration, dry-run, manual trigger, Tier 3 review) without full workspace admin access. Sync permission checks use a capability flag (`can_manage_integrations`) rather than a hardcoded `is_workspace_admin` check, so this role can be introduced in Feature 10 without a permission model migration.

---

## 10. Design Decisions

| Decision | Rationale |
|---|---|
| SpecReconciler shared between file import and webhook sync | The reconciliation logic is identical regardless of source. A single well-tested service is more reliable than parallel implementations that diverge over time. Introduced in the Spec Database feature document; confirmed here. |
| Both diff and snapshot payloads supported | Diff payloads are standard for modern cloud PLMs; snapshot payloads are the only option for legacy systems and file-based workflows. Webhook-only or snapshot-only would disqualify significant portions of the hardware PLM market. |
| Tiered auto-apply rather than full dry-run always | Requiring admin review of every sync — including routine Tier 1 value changes — creates friction that degrades into rubber-stamping. Tiering matches human attention to risk level: Tier 1 auto-applies, Tier 2 notifies, Tier 3 holds. Only genuinely consequential mutations reach a human inbox. |
| SyncBaseline stored separately from current field value | The current Arther value alone cannot distinguish a genuine conflict (both sides moved) from a stale ERP payload (only the ERP side is different). The baseline enables precise conflict detection and preserves the data model needed for two-way sync without migration. |
| Sync baseline is the diff reference, not current Arther value | Diffing against current Arther value would misclassify edits made in Arther since the last sync as "ERP is different." Only changes where the ERP has moved from the shared baseline are genuine updates; the rest are Arther's own changes and should not be overwritten. |
| Entity matching via manual linking screen, not fuzzy auto-match | Fuzzy name matching produces silent wrong links that are hard to detect. A wrong link on the first sync propagates incorrect data into the spec database invisibly. A one-time manual mapping screen has higher upfront friction but zero ambiguity. External IDs are stored and used for all future syncs, so the overhead is non-recurring. |
| Arther-wins as the default conflict policy | Arther is a documentation editorial layer, not a passive mirror of the ERP. Manual edits in Arther represent deliberate decisions — reworded descriptions, adjusted values, editorial context — that should not be silently overwritten. Suppressed ERP values are logged visibly so drift is auditable rather than hidden. |
| Variant override conflicts handled by notification, not conflict queue | A sync updating the base component canonical value does not invalidate a variant override — the override exists precisely because the variant differs from the base. Routing this to the conflict queue would incorrectly frame it as an error. Notification gives the variant owner situational awareness without implying the sync did something wrong. |
| Reconciler stops at the spec database boundary | Downstream document content is Smart Spec Tracking's responsibility. The reconciler applies spec changes; staleness tracking handles cascading those changes into documents. Crossing this boundary would couple the reconciler to the document model and create a maintenance dependency between two systems that should be independently evolvable. |
| Three intake modes sharing one reconciler pipeline | Webhook push, scheduled pull, and manual trigger serve different integration postures across the hardware PLM market. A single adapter-plus-reconciler pipeline allows all three to be supported without duplicating reconciliation logic. Adding a new intake mode in the future is an adapter-layer change only. |
| Scheduled pull minimum interval of one hour | Sub-hourly polling is infrastructure cost without proportionate value — teams needing near-real-time sync should use webhook push. Hourly covers the legitimate use cases for scheduled pull (daily release cycles, overnight ERP exports) without creating incentives to avoid the correct integration mode. |
| Dry-run with selective commit | Binary apply/cancel forces admins to choose between applying everything (including Tier 3 items they're not ready for) or applying nothing. Selective commit allows the common case — apply the clean Tier 1 changes, defer the two Tier 3 items that need investigation — without artificially blocking progress. |
| Suppressed items surfaced explicitly in dry-run | Admins expecting a specific field to update and not seeing it in the changeset have no way to diagnose the problem if suppressions are silent. The suppressed items view turns invisible integration failures into actionable information. |
| Blast radius shown as counts at launch, links as fast follow | Counts are sufficient for an admin deciding whether to proceed with a sync. Direct document links couple the dry-run view to the document layer at a point when that integration should be kept clean. Links are a one-sprint follow-on improvement after the core integration is validated. |
| Conflict escalation threshold of 7 days (configurable) | Seven days maps to a natural work cadence — a conflict that has survived a full work week is not being actively managed and warrants admin awareness. Configurable because hardware teams have meaningfully different release tempos; the default should fit the median case. |
| Three-level event log structure | A single log view cannot serve a workspace admin's weekly health check, a domain owner's field-level investigation, and an engineer's adapter debugging session. Three levels with explicit audience design keep each surface useful without conflating concerns. |
| Proactive anomaly surfacing rather than passive log | A passive log that admins must read to detect problems creates a monitoring burden that degrades over time. Anomaly surfacing — gap detection, drift trending, entity matching failure alerts — makes the integration self-reporting rather than requiring constant vigilance. |
| HMAC signature verification with replay prevention | HMAC alone allows replayed payloads to pass verification. Timestamp validation closes this window. Together they provide a standard, well-understood security baseline appropriate for the payload sensitivity (product specification data) without requiring certificate infrastructure. |
| Polling credentials in secrets manager with read-only scope requirement | Credentials stored in the application database are exposed to any database breach. Secrets manager isolation is the correct practice for external API credentials. Read-only scope is a configuration requirement, not a technical enforcement — write-scoped credentials are a security risk that the UI surfaces explicitly. |
| Integration Manager as a capability flag, not a hardcoded role check | Hardcoding `is_workspace_admin` in sync permission checks would require a permission model migration when the Enterprise tier introduces the Integration Manager role. A `can_manage_integrations` capability flag accommodates the future role with only an additive change. |
| Two-way sync explicitly tabled | Two-way sync is a significantly more complex feature that requires conflict resolution in both directions, a clear authority model for each field, and ERP-side write permission. The data model (SyncBaseline) is designed to support it without migration, but the feature itself is not in scope. |

---

## 11. Open Questions

| Question | Notes | Blocking? |
|---|---|---|
| Adapter library strategy | Resolved: first-party bespoke adapters only. No third-party integration platform (e.g., Merge.dev, Cyclr). Bespoke adapters give full control over the canonical mutation record mapping and avoid a platform dependency in a core data pipeline. Engineering cost is higher per integration, but the adapter layer architecture is designed to minimise per-adapter implementation scope. | Resolved — deferred to post-launch build |
| Launch integration list | Resolved: Arena PLM is the first planned integration. Arena is the most common PLM among Arther's target customers. The Product Variants feature document notes the SpecReconciler as the intended import path for PLM-defined variant structures; the Arena adapter will implement both field sync and variant import. Additional integrations (Duro, Windchill, custom ERP) to be scoped after Arena is validated. | Resolved — deferred to post-launch build |
| Conflict policy configurability per field | The spec describes source-level and field-level conflict policy. Field-level policy configuration is noted as a future capability — it requires a UI surface in the field settings panel and a new column on the spec field schema. Confirmed as post-launch. | Can resolve during build |
| Tier 3 notification routing | Tier 3 held mutations are surfaced in the admin's Tier 3 queue. Should workspace admins also receive an immediate notification when a Tier 3 mutation is held, or is a queue badge sufficient? A noisy Tier 3 integration could generate excessive notifications. | Can resolve during build |
| Conflict queue item assignment when no domain owner is configured | The spec falls back to document owner when no domain owner is configured for a field category. But not all fields have associated documents. In that case, the item falls back to workspace admin. Does this fallback chain need an intermediate step, or is workspace admin the right final backstop? | Can resolve during build |
| Blast radius computation cost | Staleness impact is computed during dry-run by joining `BlockSpecReference` records against the affected fields. For large workspaces with many documents and fields, this join may be expensive at dry-run time. Determine whether on-demand computation is sufficient or whether a cached impact estimate is needed. | Can resolve during build |

---

## 12. Out of Scope

**Two-way sync.** Writing changes made in Arther back to the ERP or PLM system. This is a substantially more complex feature requiring a clear authority model per field, ERP-side write credentials, and bidirectional conflict resolution. The data model (SyncBaseline) is designed not to foreclose this, but the feature itself is deferred.

**Sub-hourly scheduled polling.** Polling intervals below one hour are not supported. Teams needing near-real-time sync should configure webhook push, which has no polling overhead and propagates changes immediately.

**Automatic structural migrations.** When a Tier 3 mutation arrives (component delete, field type change, component move), the reconciler holds it for admin confirmation. It does not attempt to automatically migrate documents, reassign block references, or resolve orphaned tokens. Those actions follow from the admin's explicit decision to accept the mutation, at which point the Spec Database's archive cascade handles the downstream effects.

**Multi-source conflict resolution.** When two sync sources send conflicting values for the same field in the same sync window, only the later-arriving value is evaluated for conflict. Resolving conflicts between multiple external sources simultaneously is out of scope for v1.

**ERP write-back from document edits.** Manual edits to spec field values in Arther are not propagated back to any external system. External Sync is a one-way inbound integration at this stage.

**Integration health SLA monitoring.** Tracking uptime, latency, and error rates for external sync integrations against a defined SLA is an Enterprise observability concern. The event log and anomaly surfacing provide operational visibility; formal SLA monitoring belongs to the Enterprise feature tier.

**Payload transformation rules.** Some ERP integrations require value transformation beyond unit mapping — for example, converting an ERP's internal part classification code to a human-readable enum value in Arther. Configurable field-level transformation rules are a roadmap item; the v1 adapter layer handles unit mapping only.

---

*Arther — External Sync: Feature Specification. Version 1.1, May 2026. Deferred post-launch. Greenfield specification covering the SpecReconciler execution model, mutation taxonomy and tiered auto-apply, adapter layer with three intake modes, diff and snapshot payload handling, entity matching via manual linking screen, sync baseline model for conflict detection, three conflict types with configurable resolution policies and conflict queue UX, dry-run mode with changeset, suppressed items, blast radius, and selective commit views, three-level sync event log with proactive anomaly surfacing, HMAC webhook authentication with secret rotation and replay prevention, outbound polling credential management, and the integration-aware access control model. Intended as the authoritative design reference for this feature bucket, upstream of the Spec Database and Smart Spec Tracking features and dependent on the domain ownership model defined in Smart Spec Tracking.*
