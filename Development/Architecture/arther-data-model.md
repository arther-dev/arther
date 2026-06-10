# Arther — Data Model & ERD

**Date:** 8 June 2026 · **Status:** Proposed · Companion to [`arther-architecture.md`](./arther-architecture.md) · [`arther-adrs.md`](./arther-adrs.md)

The data model translates the feature-spec entities into a Postgres schema for the architecture in [ADR-004](./arther-adrs.md#adr-004) / [ADR-005](./arther-adrs.md#adr-005). It is grouped into eight domains. Each ER diagram shows primary keys, foreign keys, and the columns that carry meaning; conventions and cross-cutting rules (tenancy, RLS, JSONB, immutability, indexing) follow in §10–§16.

Diagrams render in the markdown preview (Mermaid). Cross-domain foreign keys are marked `FK` and named so they read across diagrams even though Mermaid can't draw between them.

---

## 1. Domain map

```mermaid
flowchart TD
  ID[Identity & Workspace]
  SPEC[Spec Database]
  GEN[Doc Types · Briefs · Brand]
  DOC[Documents & Blocks]
  TRACK[Smart Spec Tracking]
  COLLAB[Collaboration & Review]
  REUSE[Content Reuse]
  VAR[Product Variants]
  PUB[Publishing & Portal]
  ANL[Analytics & Audit]

  ID --> SPEC --> GEN --> DOC
  DOC --> COLLAB
  DOC --> PUB
  SPEC --> TRACK --> DOC
  DOC --> REUSE
  SPEC --> VAR --> DOC
  PUB --> ANL
  DOC --> ANL
  ID -.tenancy.-> SPEC & GEN & DOC & TRACK & COLLAB & REUSE & VAR & PUB & ANL
```

Every tenant-scoped table carries `workspace_id` (the dashed tenancy edges). The arrows are the dominant data dependencies, matching the PRD build order.

---

## 2. Identity & Workspace

Decoupled auth ([ADR-010](./arther-adrs.md#adr-010), guardrail 3): provider identity in `auth_providers`, normalised app identity in `users`, role per workspace in `workspace_members`. Seat tier (Editor paid / Viewer free) is derived from role, not stored.

```mermaid
erDiagram
  USERS ||--o{ AUTH_PROVIDERS : "authenticates via"
  USERS ||--o{ WORKSPACE_MEMBERS : "member through"
  WORKSPACES ||--o{ WORKSPACE_MEMBERS : "has"
  WORKSPACES ||--o{ WORKSPACE_INVITATIONS : "issues"
  WORKSPACES ||--o| USERS : "owned by"

  USERS {
    uuid id PK
    text email UK
    text name
    timestamptz created_at
  }
  AUTH_PROVIDERS {
    uuid id PK
    uuid user_id FK
    text provider "email | google | (saml later)"
    text provider_user_id
    timestamptz created_at
  }
  WORKSPACES {
    uuid id PK
    text name
    text slug UK "immutable; portal subdomain"
    text logo_url
    uuid owner_id FK
    timestamptz deleted_at "soft delete; hides workspace immediately"
    timestamptz purge_after "hard delete after 14-day grace (purge job)"
    timestamptz created_at
  }
  WORKSPACE_MEMBERS {
    uuid id PK
    uuid workspace_id FK
    uuid user_id FK
    text role "owner | admin | member | viewer"
    uuid invited_by FK
    timestamptz joined_at
  }
  WORKSPACE_INVITATIONS {
    uuid id PK
    uuid workspace_id FK
    text email
    text role "admin | member"
    uuid invited_by FK
    timestamptz expires_at
    timestamptz accepted_at
    timestamptz revoked_at
  }
```

---

## 3. Spec Database

The graph: `products` and `components` are independent entities joined by `product_components` edges; product-specific values live on the edge (here as `product_component_overrides` rows for the override-review flow), never on the component. `spec_fields` may belong to a component or a product (PRD §7.1.1) via nullable `component_id`/`product_id` FKs with a one-owner CHECK (`num_nonnulls(component_id, product_id) = 1`) — real foreign keys rather than a polymorphic `owner_type`/`owner_id` pair, so the database enforces referential integrity and cascades. `field_versions` is append-only and powers staleness; `current_version_id` on the field points at the latest. `import_sessions` (not diagrammed) holds the multi-step import state: upload → interpretation → proposed mutations → per-row decisions → commit, so a refresh never loses the dry-run and committed decisions stay auditable.

```mermaid
erDiagram
  PRODUCTS ||--o{ PRODUCT_COMPONENTS : "composes"
  COMPONENTS ||--o{ PRODUCT_COMPONENTS : "used in"
  PRODUCT_COMPONENTS ||--o{ PRODUCT_COMPONENT_OVERRIDES : "scalar overrides"
  COMPONENTS ||--o{ SPEC_FIELDS : "owns"
  PRODUCTS ||--o{ SPEC_FIELDS : "owns (product-level)"
  SPEC_FIELDS ||--o{ FIELD_VERSIONS : "history"
  SPEC_FIELDS ||--o{ FIELD_COMMENTS : "annotated by"
  PRODUCTS ||--o{ PRODUCT_RELEASES : "snapshots"
  PRODUCT_RELEASES ||--o{ RELEASE_FIELD_VALUES : "pins"
  FIELD_VERSIONS ||--o{ RELEASE_FIELD_VALUES : "pinned at"
  UNITS ||--o{ SPEC_FIELDS : "measured in"
  SPEC_CATEGORIES ||--o{ SPEC_FIELDS : "categorised by"

  PRODUCTS {
    uuid id PK
    uuid workspace_id FK
    text name
    text description
    timestamptz archived_at
    uuid created_by FK
    timestamptz created_at
  }
  COMPONENTS {
    uuid id PK
    uuid workspace_id FK
    text name
    text type "assembly | module | part"
    text default_category
    timestamptz archived_at
    uuid created_by FK
  }
  PRODUCT_COMPONENTS {
    uuid id PK
    uuid product_id FK
    uuid component_id FK
    uuid parent_component_id FK "self-nest; null = top level"
    int quantity
  }
  PRODUCT_COMPONENT_OVERRIDES {
    uuid id PK
    uuid product_component_id FK
    uuid field_id FK
    jsonb value "ScalarOverride value"
    uuid set_by FK
    timestamptz set_at
  }
  SPEC_FIELDS {
    uuid id PK
    uuid component_id FK "XOR with product_id"
    uuid product_id FK "exactly one owner (CHECK)"
    text name
    text type "scalar|range|toleranced|boolean|enum|multi_enum|table|reference"
    jsonb value "typed FieldValue union"
    uuid unit_id FK
    text conditions
    text source "rated|typical|measured|calculated"
    text formula
    jsonb depends_on "field id array"
    jsonb options "enum options"
    text category FK
    bool required
    bool internal_only
    int display_order
    uuid current_version_id FK
    text provenance "manual | sync"
    text sync_source_id
    timestamptz last_synced_at
    timestamptz archived_at
  }
  FIELD_VERSIONS {
    uuid id PK
    uuid field_id FK
    jsonb value
    jsonb diff "structured; row-level for tables"
    uuid changed_by FK
    timestamptz changed_at
    text note
  }
  FIELD_COMMENTS {
    uuid id PK
    uuid field_id FK
    uuid field_version_id FK "context marker"
    jsonb value_snapshot
    uuid author_id FK
    text body
    uuid parent_comment_id FK
    timestamptz created_at
  }
  PRODUCT_RELEASES {
    uuid id PK
    uuid product_id FK
    text name
    text tag
    uuid created_by FK
    timestamptz created_at
  }
  RELEASE_FIELD_VALUES {
    uuid release_id FK
    uuid field_id FK
    uuid version_id FK
  }
  UNITS {
    uuid id PK
    text name
    text symbol
    text dimension
    numeric si_factor
    bool custom
    uuid workspace_id FK "null = built-in"
  }
  SPEC_CATEGORIES {
    uuid id PK
    uuid workspace_id FK
    text name
    bool built_in
    bool hidden
    int display_order
  }
```

Templates (`spec_templates`) are stored separately as scaffolds (built-in forkable + workspace-owned), holding their component/field structure as JSONB; they create real `components`/`spec_fields` on use.

---

## 4. Document Types, Briefs & Brand

Generation inputs. Document Types are generation schemas; sections declare which spec categories and brief fragment keys feed them. Briefs mirror the graph (attached to a product *or* a component). Brand Profiles and Quality Standards are separate concerns ([AI generator spec](../../Features/Spec%20Docs/arther-ai-document-generator.md)).

```mermaid
erDiagram
  DOCUMENT_TYPES ||--o{ DOCUMENT_TYPE_SECTIONS : "has"
  DOCUMENT_TYPES ||--o{ DOCUMENT_TYPE_APPROVAL_ROLES : "requires"
  DOCUMENT_TYPE_APPROVAL_ROLES ||--o{ APPROVAL_ROLE_ASSIGNMENTS : "assigned to"
  DOCUMENT_TYPES ||--o| BRAND_PROFILES : "default brand"
  DOCUMENT_TYPES ||--o| DOCUMENT_QUALITY_STANDARDS : "quality bar"
  PRODUCT_BRIEFS ||--o{ BRIEF_FRAGMENTS : "fragments"

  DOCUMENT_TYPES {
    uuid id PK
    uuid workspace_id FK "null = built-in"
    text name
    text description
    bool built_in
    uuid forked_from FK
    uuid default_brand_profile_id FK
    uuid quality_standard_id FK
    timestamptz archived_at
    uuid created_by FK
  }
  DOCUMENT_TYPE_SECTIONS {
    uuid id PK
    uuid document_type_id FK
    text name
    int display_order
    jsonb spec_field_categories
    jsonb brief_fragment_keys
    bool brief_required
    jsonb default_block_types
    jsonb quality_overrides
  }
  DOCUMENT_TYPE_APPROVAL_ROLES {
    uuid id PK
    uuid document_type_id FK
    text role_label
    bool required
    int display_order
  }
  APPROVAL_ROLE_ASSIGNMENTS {
    uuid id PK
    uuid role_id FK
    uuid workspace_member_id FK
    uuid assigned_by FK
    timestamptz assigned_at
  }
  PRODUCT_BRIEFS {
    uuid id PK
    uuid workspace_id FK
    text entity_type "product | component"
    uuid entity_id FK
    uuid created_by FK
  }
  BRIEF_FRAGMENTS {
    uuid id PK
    uuid brief_id FK
    text key "overview | target_applications | ..."
    text content
    uuid updated_by FK
    timestamptz updated_at
  }
  BRAND_PROFILES {
    uuid id PK
    uuid workspace_id FK
    text name
    bool is_workspace_default
    text logo_url
    text primary_colour
    jsonb typography
    jsonb voice_descriptors
    text tone_notes
    jsonb glossary
    text unit_preference "metric | imperial | both"
    timestamptz archived_at
  }
  DOCUMENT_QUALITY_STANDARDS {
    uuid id PK
    uuid workspace_id FK
    text name
    jsonb constraints
  }
```

---

## 5. Documents & Blocks

A `document` is the logical entity; `document_revisions` carry lifecycle state and the working copy; `blocks` are the working-copy block tree (rich text as JSONB, with inline spec tokens inside `content` — the TipTap/ProseMirror document shape, [ADR-013](./arther-adrs.md#adr-013)). The three reference tables are the spine of Smart Spec Tracking and the source taxonomy.

Two operational tables accompany them (not diagrammed): `generation_runs` and `generation_run_sections` persist per-section generation state — the Realtime subscription target for live progress, the resume record for partial failure and section-level retry, and per-run token/cost accounting. Members read them; only the generation pipeline (service role) writes them, so runs cannot be forged from a client.

For in-app search, `blocks.text_content` holds the app-written plain-text projection of `content` (the rich-text tree isn't parseable by an immutable SQL function), with a generated `text_search tsvector` + GIN index over it.

```mermaid
erDiagram
  DOCUMENTS ||--o{ DOCUMENT_REVISIONS : "revisions"
  DOCUMENT_REVISIONS ||--o{ BLOCKS : "working copy"
  BLOCKS ||--o{ BLOCKS : "nests (1 level)"
  BLOCKS ||--o{ BLOCK_SPEC_REFERENCES : "references specs"
  BLOCKS ||--o| BLOCK_BRIEF_REFERENCES : "references brief"
  BLOCKS ||--o| PLACEHOLDER_BRIEF_REFERENCES : "awaits brief"
  DOCUMENTS }o--|| PRODUCTS : "documents"
  DOCUMENTS }o--|| DOCUMENT_TYPES : "typed by"

  DOCUMENTS {
    uuid id PK
    uuid workspace_id FK
    uuid product_id FK
    uuid document_type_id FK
    uuid brand_profile_id FK
    text title
    text slug
    uuid owner_id FK
    uuid current_revision_id FK
    timestamptz archived_at
    uuid created_by FK
  }
  DOCUMENT_REVISIONS {
    uuid id PK
    uuid document_id FK
    int revision_number
    text state "draft | review | approved | published"
    text review_brief
    timestamptz review_due_date
    timestamptz published_at
    uuid published_by FK
    uuid created_by FK
    timestamptz created_at
  }
  BLOCKS {
    uuid id PK
    uuid document_id FK
    uuid revision_id FK
    text type "20 block types"
    uuid parent_block_id FK
    int display_order
    text source "spec|brief|placeholder|manual|snippet|structural"
    uuid snippet_id FK
    jsonb content "RichTextContent / block props"
    jsonb degradation "per-target contract"
    uuid created_by FK
    timestamptz last_edited_at
    uuid last_edited_by FK
  }
  BLOCK_SPEC_REFERENCES {
    uuid id PK
    uuid block_id FK
    uuid document_id FK
    uuid field_id FK
    uuid field_version_id FK "staleness anchor"
    uuid release_id FK
    uuid variant_id FK
    text reference_type "generated|manually_linked|chart"
  }
  BLOCK_BRIEF_REFERENCES {
    uuid id PK
    uuid block_id FK
    uuid brief_id FK
    text fragment_key
    text content_snapshot
    timestamptz generated_at
  }
  PLACEHOLDER_BRIEF_REFERENCES {
    uuid id PK
    uuid block_id FK
    text fragment_key
    text section_name
    text entity_type
    uuid entity_id FK
  }
```

---

## 6. Collaboration & Review

The four-state machine lives on `document_revisions.state`; approvals are AND-logic across `document_type_approval_roles`. Comments anchor to a block or a text range and can orphan. Notifications are the **one** delivery system for the whole product (invariant 8).

```mermaid
erDiagram
  DOCUMENT_REVISIONS ||--o{ APPROVAL_RECORDS : "approvals"
  DOCUMENT_REVISIONS ||--o{ COMMENT_THREADS : "comments on"
  COMMENT_THREADS ||--o{ COMMENTS : "messages"
  COMMENTS ||--o{ COMMENTS : "one-level replies"
  USERS ||--o{ NOTIFICATIONS : "receives"
  WORKSPACE_MEMBERS ||--o{ NOTIFICATION_PREFERENCES : "configures"

  APPROVAL_RECORDS {
    uuid id PK
    uuid revision_id FK
    uuid role_id FK
    uuid approver_id FK
    text action "approved | rejected | owner_override"
    text reason
    text override_on_behalf_of
    timestamptz recorded_at
  }
  COMMENT_THREADS {
    uuid id PK
    uuid revision_id FK
    uuid block_id FK
    text anchor_type "block | text_range"
    jsonb text_anchor "offsets + anchor_text"
    text status "open | resolved | orphaned"
    text orphaned_reason
    uuid created_by FK
    timestamptz resolved_at
  }
  COMMENTS {
    uuid id PK
    uuid thread_id FK
    uuid parent_comment_id FK
    uuid author_id FK
    text body "may contain @mentions"
    timestamptz created_at
    timestamptz edited_at
  }
  NOTIFICATIONS {
    uuid id PK
    uuid recipient_id FK
    uuid workspace_id FK
    text event_type
    jsonb payload
    timestamptz read_at
    timestamptz created_at
  }
  NOTIFICATION_PREFERENCES {
    uuid workspace_member_id FK
    text event_type
    bool in_app_enabled
    bool email_enabled
  }
```

---

## 7. Smart Spec Tracking

Detection is a join over `block_spec_references`; the outputs are typed review items aggregated into `dashboard_action_items`. Domain ownership resolves through `domain_ownership_config` with the four-step fallback.

```mermaid
erDiagram
  FIELD_CHANGE_DIFFS ||--o{ SECTION_REVIEW_ITEMS : "triggers"
  FIELD_CHANGE_DIFFS ||--o{ SCALAR_OVERRIDE_REVIEW_ITEMS : "triggers"
  FIELD_CHANGE_DIFFS ||--o{ SNIPPET_REVIEW_ITEMS : "triggers"
  DASHBOARD_ACTION_ITEMS }o--|| USERS : "assigned to"
  DOCUMENTS ||--o| DOCUMENT_REVIEW_STATES : "review state"

  DOCUMENT_REVIEW_STATES {
    uuid id PK
    uuid document_id FK
    uuid workspace_id FK
    text state "current | needs_review"
    jsonb triggered_by_field_ids
    timestamptz last_published_at
    uuid last_published_by FK
  }
  FIELD_CHANGE_DIFFS {
    uuid id PK
    uuid field_id FK
    uuid old_version_id FK
    uuid new_version_id FK
    text old_display_value
    text new_display_value
    uuid changed_by FK
    timestamptz changed_at
  }
  SECTION_REVIEW_ITEMS {
    uuid id PK
    uuid workspace_id FK
    uuid document_id FK
    text section_name
    text field_category
    uuid assigned_to FK "domain owner"
    jsonb affected_block_ids
    text status "pending|approved|changes_requested"
  }
  SCALAR_OVERRIDE_REVIEW_ITEMS {
    uuid id PK
    uuid product_id FK
    uuid field_id FK
    jsonb override_value
    uuid assigned_to FK "override set_by"
    text status "pending|confirmed|updated|removed"
  }
  SNIPPET_REVIEW_ITEMS {
    uuid id PK
    uuid snippet_id FK
    jsonb affected_block_ids
    uuid assigned_to FK "snippet owner"
    jsonb embedding_document_ids
    text status
  }
  CHART_CONFIGURATION_FLAGS {
    uuid id PK
    uuid block_id FK
    uuid field_id FK
    text missing_column_id
    timestamptz resolved_at
  }
  DASHBOARD_ACTION_ITEMS {
    uuid id PK
    uuid workspace_id FK
    text type "section_review|document_approval|override_review|..."
    uuid assigned_to FK
    uuid reference_id "the underlying item"
    text title
    text context
    uuid document_id FK
    text status "pending | resolved"
    timestamptz created_at
  }
  DOMAIN_OWNERSHIP_CONFIG {
    uuid id PK
    uuid workspace_id FK
    text field_category
    uuid product_id FK "null = workspace default"
    uuid owner_user_id FK
    uuid set_by FK
  }
```

---

## 8. Content Reuse & Variants

Library items hold a self-contained block sequence (JSONB) with version history; `snippet_embeds` track live/overridden/source_changed state per embed. **Authoritative-source invariant:** the `blocks` row (`source='snippet'`, `snippet_id`) *is* the placement — position comes from `blocks.display_order`; `snippet_embeds` carries only state, keyed 1:1 to the placing block (`block_id`, unique). Variants are deltas from base ([variants spec](../../Features/Spec%20Docs/arther-product-variants.md)); resolved spec is computed at query time and cached in Redis (no table; [ADR-014](./arther-adrs.md#adr-014)).

```mermaid
erDiagram
  LIBRARY_ITEMS ||--o{ LIBRARY_ITEM_VERSIONS : "versions"
  LIBRARY_ITEMS ||--o{ SNIPPET_EMBEDS : "embedded as"
  DOCUMENTS ||--o{ SNIPPET_EMBEDS : "embeds"
  PRODUCTS ||--o{ PRODUCT_VARIANTS : "varies into"
  PRODUCT_VARIANTS ||--o{ VARIANT_DELTAS : "deltas"
  BLOCKS ||--o| BLOCK_VARIANT_SCOPES : "scoped to variants"

  LIBRARY_ITEMS {
    uuid id PK
    uuid workspace_id FK
    text name
    text type "snippet | template"
    uuid owner_id FK
    int embed_count "blocks delete if > 0"
    timestamptz updated_at
  }
  LIBRARY_ITEM_VERSIONS {
    uuid version_id PK
    uuid library_item_id FK
    jsonb blocks_snapshot
    uuid created_by FK
    text change_note
  }
  SNIPPET_EMBEDS {
    uuid id PK
    uuid document_id FK
    uuid block_id FK "the placing block; position = its display_order"
    uuid library_item_id FK
    text state "live | overridden | source_changed"
    jsonb override_blocks
    uuid source_version_at_override FK
    bool stale_prose_flag
    bool stale_prose_resolved_locally
  }
  PRODUCT_VARIANTS {
    uuid id PK
    uuid product_id FK
    text name
    text slug
    text description
    bool is_default
    uuid created_by FK
  }
  VARIANT_DELTAS {
    uuid id PK
    uuid variant_id FK
    text delta_type "SCALAR_OVERRIDE|COMPONENT_SWAP|COMPONENT_REMOVE|COMPONENT_ADD"
    uuid component_id FK
    uuid field_id FK
    jsonb override_value
    uuid replacement_component_id FK
    uuid new_component_id FK
    uuid position_after FK
    timestamptz created_at
  }
  BLOCK_VARIANT_SCOPES {
    uuid block_id FK
    text mode "ALL | DERIVED | MANUAL"
    jsonb variant_ids "MANUAL only"
    uuid derived_component_id FK "DERIVED only"
  }
```

---

## 9. Publishing, Portal & Analytics

`published_snapshots` are the only sanctioned copy of resolved spec values (invariants 1, 5): a frozen, versioned `block_tree` + `resolution_manifest` + pre-rendered PDF + access config + publish-time `search_text` (with a generated tsvector; portal search queries each document's latest non-archived snapshot only). Snapshots are created **only** by the publish pipeline (no authenticated INSERT policy — a client can't bypass the approval machine), members read, admins may update only the operational columns (freeze trigger), and rows are never deleted (no-delete trigger; unpublish = `archived_at`). Access-config changes and magic-link issuance/revocation write `audit_log` rows from database triggers. Magic links are member-readable but **editor**-issued (viewers cannot mint external access). Analytics and audit are append-only.

```mermaid
erDiagram
  DOCUMENTS ||--o{ PUBLISHED_SNAPSHOTS : "publishes"
  PUBLISHED_SNAPSHOTS ||--o{ MAGIC_LINKS : "gated by"
  MAGIC_LINKS ||--o{ MAGIC_LINK_ACCESS_LOGS : "accessed via"
  WORKSPACES ||--o{ CUSTOM_DOMAINS : "maps"
  WORKSPACES ||--o{ ANALYTICS_EVENTS : "emits"
  WORKSPACES ||--o{ AUDIT_LOG : "records"

  PUBLISHED_SNAPSHOTS {
    uuid id PK
    uuid document_id FK
    uuid workspace_id FK
    uuid product_id FK
    uuid variant_id FK
    text version "semver"
    jsonb block_tree "resolved, no live refs; FROZEN by trigger"
    jsonb resolution_manifest
    text pdf_storage_key
    bool pdf_ready
    text search_text "portal FTS projection, extracted at publish"
    jsonb access_config "public|open_link|allowlist; changes audited by trigger"
    timestamptz archived_at "unpublish = archive; rows are never deleted"
    uuid published_by FK
    timestamptz published_at
  }
  MAGIC_LINKS {
    uuid id PK
    uuid document_id FK
    uuid workspace_id FK
    text email
    text token_hash
    text type "open | allowlist"
    timestamptz expires_at
    timestamptz revoked_at
  }
  MAGIC_LINK_ACCESS_LOGS {
    uuid id PK
    uuid magic_link_id FK
    uuid document_id FK
    timestamptz accessed_at
  }
  CUSTOM_DOMAINS {
    uuid id PK
    uuid workspace_id FK
    text domain UK
    text status "pending | verified | active"
    timestamptz verified_at
  }
  ANALYTICS_EVENTS {
    uuid id PK
    uuid workspace_id FK
    text event_type "document_viewed|document_generated|..."
    text session_id
    uuid magic_link_id FK
    uuid document_id FK
    jsonb payload
    timestamptz occurred_at
  }
  AUDIT_LOG {
    uuid id PK
    uuid workspace_id FK
    uuid actor_id FK
    text action
    text resource_type
    uuid resource_id
    jsonb metadata
    timestamptz occurred_at
  }
```

---

## 10. Tenancy & Row-Level Security

Every tenant-scoped table carries `workspace_id`. RLS policies restrict rows to the caller's workspaces via security-definer membership helpers, and writes are **role-aware** — the row mirrors the seat boundary, not just the tenant boundary:

```sql
-- the standard content-table pattern (members read, editors write)
alter table products enable row level security;

create policy products_read on products for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy products_write on products for all to authenticated
  using (private.is_workspace_editor(workspace_id))      -- owner/admin/member; NOT viewer
  with check (private.is_workspace_editor(workspace_id));
```

Four write tiers: **member** (viewers included) only where the specs grant viewers writes — comments and approval records; **editor** (`is_workspace_editor`) for all authoring content; **admin** for Settings surfaces (Document Types, Brand Profiles, quality standards, units, categories, domain ownership, custom domains, approval-role assignment); **service-role-only** (no authenticated write policy at all) for pipeline-owned tables — `published_snapshots` (insert/delete), `generation_runs`/`generation_run_sections`, `document_review_states`, `field_change_diffs`, `notifications`, `analytics_events`, `audit_log`.

The authenticated app connects with the user JWT, so RLS is active as defence in depth behind `canDo`. Background jobs and the portal use a service role that bypasses RLS — so they go through a thin data-access layer that **requires** an explicit `workspace_id` on every query (enforced by lint + tests). The portal only ever reads `published_snapshots`, which contain no live spec or draft data. The tenancy helpers exclude soft-deleted workspaces, so a deletion request hides the tenant everywhere at once.

---

## 11. JSONB vs. relational — the rule

Relational where we join, constrain, or audit; JSONB for irregular interiors:

| JSONB column | Holds | Why not relational |
|---|---|---|
| `spec_fields.value`, `field_versions.value` | the 8 typed `FieldValue` shapes | one column, eight shapes; validated by Zod |
| `blocks.content` | rich-text node tree incl. inline spec tokens | recursive, variable; queried as a tree, not by row |
| `product_component_overrides.value`, `variant_deltas.override_value` | a single field value | mirrors `FieldValue` |
| `published_snapshots.block_tree` | fully resolved block array | a frozen artifact, never queried piecemeal |
| `*.resolution_manifest`, `*.access_config`, `*.glossary`, `*.constraints` | structured config / provenance | schema-flexible, read whole |

Inline spec tokens inside `blocks.content` still create rows in `block_spec_references` so staleness stays a relational join — the JSONB holds presentation, the table holds the queryable relationship.

---

## 12. Immutability & history

Append-only (never updated or deleted in normal operation): `field_versions`, `approval_records`, `published_snapshots`, `product_releases` + `release_field_values`, `magic_link_access_logs`, `analytics_events`, `audit_log`. This is both a product requirement (field history powers staleness; approvals are an audit record) and a compliance control.

**Enforced, not conventional:** each of these combines (a) no mutating RLS policy for `authenticated` (default deny) with (b) `prevent_mutation()` / freeze triggers that stop even the **service role** — `approval_records` rejects update *and* delete; `published_snapshots` freezes content columns and rejects delete (unpublish = `archived_at`); releases freeze all but `notes`. Two documented carve-outs: `field_versions` may cascade-delete with a hard-deleted field (owner context only; the guards make that possible only at zero references), and the workspace purge job runs with `session_replication_role = replica`, which disables these triggers for the one sanctioned destruction path.

---

## 13. Archive vs. delete

Entities with dependents (`products`, `components`, `spec_fields`, `documents`, `document_types`, `brand_profiles`, library items) carry `archived_at`. Hard delete is allowed only at zero references — enforced by **BEFORE DELETE guard triggers** that check the referencing tables (`block_spec_references`, `product_components`, `variant_deltas`, releases, snapshots, embeds) and raise otherwise; these fire even on cascades, so the protection holds when app logic is bypassed (invariant 7). FK actions then divide by meaning: `on delete restrict` where a *sibling* must never be orphaned (`documents.product_id`, `published_snapshots.product_id`, edge→component, release values→field/version, embeds→library item), and `on delete cascade` for *owned* children, which is reachable only once the guards have said yes. The workspace root is the special case: no JWT delete path at all — soft delete + 14-day grace + purge job (§10).

---

## 14. Indexing essentials

| Purpose | Index |
|---|---|
| Staleness join | `block_spec_references (field_id, field_version_id)`; `(document_id)`; `(variant_id)` |
| Current value lookup | `spec_fields (current_version_id)`; `field_versions (field_id, changed_at desc)` |
| Tenancy filters | `workspace_id` on every tenant table (composite with the common sort key) |
| Graph traversal | `product_components (product_id, parent_component_id)`; `(component_id)` |
| Dashboard | `dashboard_action_items (assigned_to, status, created_at desc)` |
| Portal routing | `documents (workspace_id, slug)`; `published_snapshots (document_id, version)`; `custom_domains (domain)` |
| Search | GIN on `blocks.text_search` (in-app) and `published_snapshots.search_tsv` (portal) — both generated tsvectors over app-extracted text columns; `pg_trgm` GIN on `spec_fields.name` and `documents.title` for fuzzy |
| Generation/jobs | `generation_runs (workspace_id, created_at desc)`; `generation_run_sections (run_id, display_order)`; `document_revisions (review_due_date) where state='review'` for the reminders cron |
| Analytics | `analytics_events (workspace_id, event_type, occurred_at)`; partition by month at volume |

---

## 15. Conventions

- **IDs:** `uuid` (v7 preferred — time-ordered, index-friendly) primary keys everywhere.
- **Time:** `timestamptz`, UTC.
- **Attribution (guardrail 2):** `created_by`, `created_at`, `updated_by`, `updated_at` on every **mutable** entity from migration 1; append-only tables carry created-side attribution only (they never update); a few tables use domain-specific equivalents (`blocks.last_edited_by`, `overrides.set_by`, `domain_ownership_config.set_by`).
- **Soft-state:** `archived_at` (+ `archived_by`) rather than status enums where the lifecycle is archive/restore.
- **Migrations:** every schema change is a migration file (never a console edit); run and confirmed in a production-separate environment first.

---

## 16. What lives outside Postgres

- **Resolved variant spec** — computed at query time, cached in Redis (Upstash), invalidated on base-spec or delta change. Never a table (prevents silent divergence).
- **Local editor save queue** — client-side (browser), drains to the server on reconnect; not server state.
- **Files** — media, brand logos, and pre-rendered PDFs in Supabase Storage; rows hold storage keys, not blobs.
- **Live generation/job progress** — persisted per section in Postgres and streamed to the client via Realtime; the durable task is the source of truth.

---

*Arther — Data Model & ERD v0.2 (post-audit, 9 June 2026). ~60 entities across eight domains, Postgres with relational structure + JSONB interiors, role-aware RLS, trigger-enforced append-only history, archive-only lifecycle, and app-extracted FTS columns. Pairs with the architecture document and ADR set.*
