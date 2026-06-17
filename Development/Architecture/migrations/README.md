# Arther — Database migrations (Phase 1 foundation)

SQL migrations for the [architecture](../arther-architecture.md): conventions, identity & workspace, the spec database (Phase 1), and generation, documents/blocks, and Smart Spec Tracking (Phase 2). They implement the [data model](../arther-data-model.md) for what [Phase 1](../arther-phase1-tasks.md) and [Phase 2](../arther-phase2-tasks.md) build. Later domains (collaboration, publishing, content reuse, variants, analytics) get their own migration files in subsequent phases.

## Files (apply in order)

**Phase 1 — Foundation**

| File | Creates |
|---|---|
| `0001_conventions.sql` | Extensions (`pgcrypto`, `pg_trgm`, `citext`), the `private` helper schema, `set_updated_at()` / `prevent_mutation()` triggers, the immutable `audit_log`. |
| `0002_identity_workspace.sql` | `users`, `auth_providers`, `workspaces` (with **soft delete + 14-day grace**: `request_workspace_deletion` / `cancel_workspace_deletion` RPCs, no JWT hard-delete), `workspace_members`, `workspace_invitations`; recursion-safe tenancy helpers incl. `is_workspace_editor` (the viewer/editor write boundary); `handle_new_user()`; RLS. |
| `0003_spec_database.sql` | `units`, `spec_categories`, `products`, `components`, `product_components`, `spec_fields`, `field_versions`, `product_component_overrides`, `field_comments`, `product_releases` + `release_field_values` (**frozen: immutable snapshots, notes-only edits, no deletes**), `spec_templates`, `import_sessions` (multi-step import dry-run state); RLS; archive guards incl. `guard_product_hard_delete`; the `create_workspace` / `seed_workspace_defaults` RPCs; the built-in unit registry seed. |

**Phase 2 — Generation & Editing**

| File | Creates |
|---|---|
| `0004_generation_brand.sql` | `brand_profiles`, `document_quality_standards`, `document_types` (+ `document_type_sections`, `document_type_approval_roles`, `approval_role_assignments`); admin-gated Settings policies; `product_briefs`, `brief_fragments`; RLS; seeds **all five** built-in Document Types (Datasheet, Installation Manual, User Guide, Quick Start, Declaration of Conformity). |
| `0005_documents_blocks.sql` | `documents` (publish-history delete guard), `document_revisions` (+ due-date partial index for the reminders cron), `blocks` (20 types, one-level containers, `text_content` + generated tsvector for in-app FTS), `block_spec_references`, `block_brief_references`, `placeholder_brief_references`, **`generation_runs` + `generation_run_sections`** (per-section progress; service-role writes only); RLS; **extends the archive guards** to block hard-delete while block references exist. |
| `0006_smart_spec_tracking.sql` | `document_review_states`, `field_change_diffs`, the four review-item tables, `chart_configuration_flags`, `dashboard_action_items`, `domain_ownership_config`; RLS. |

**Phase 3 — Collaboration & Publishing**

| File | Creates |
|---|---|
| `0007_collaboration.sql` | `approval_records` (append-only: no-update **and** no-delete triggers; viewers may approve), `comment_threads`, `comments` (viewers may comment), and the unified `notifications` + `notification_preferences`; RLS (notifications scoped to the recipient). |
| `0008_publishing_portal.sql` | `published_snapshots` — **members read-only; no authenticated INSERT (publish pipeline only, so approvals can't be bypassed); no deletes ever (trigger); unpublish = `archived_at`; admin-only updates limited to `pdf_*` / `search_text` / `access_config` / archive by the freeze guard; access changes audit-logged by trigger**. Portal FTS (`search_text` + tsvector). `magic_links` (editor-issued, never viewers; issuance/revocation audit-logged by trigger), `magic_link_access_logs` (append-only), `custom_domains` (admin); RLS. |

**Phase 4 — Advanced Capabilities**

| File | Creates |
|---|---|
| `0009_content_reuse.sql` | `library_items`, `library_item_versions`, `snippet_embeds` (override model; keyed 1:1 to the placing block — the block row is the placement, the embed row is the state), `duplication_records`; archive-not-delete guard; **wires `blocks.snippet_id` + `snippet_review_items.snippet_id` → `library_items`**; RLS. |
| `0010_variants.sql` | `product_variants`, `variant_deltas` (4 delta types), `block_variant_scopes`; **wires `block_spec_references.variant_id`, `published_snapshots.variant_id`, `generation_runs.variant_id` → `product_variants`**; extends the component guard to variant deltas and the product guard to variants; RLS. |
| `0011_analytics.sql` | `analytics_events` (append-only shared envelope; partition-by-month at volume); RLS. |
| `0012_spec_field_rpcs.sql` | `update_spec_field_value()` — atomic version append + pointer move + value update (F5.5), security invoker so caller RLS governs. |
| `0013_releases_overrides.sql` | `create_product_release()` — atomic snapshot pinning current FieldVersions (F5.7, invoker rights); release delete policy + document-lineage guard (§3.8); type-change-while-overridden guard + override integrity guard (§3.5). |
| `0014_membership_governance.sql` | Owner rules trigger (**exactly one owner**), atomic `transfer_workspace_ownership()` (definer, GUC-scoped bypass), `get/accept_workspace_invitation()` definer RPCs for the RLS-blind invitee (F4.3/F4.4). |
| `0015_import_commit.sql` | `commit_import_session()` — F7.6: applies a reviewed import plan atomically (product → components → edges → fields → values via 0012) and auto-creates the import release via 0013; invoker rights, editor RLS governs. |
| `0016_workspace_purge.sql` | F8.7 workspace deletion: `purge_deleted_workspaces()` — the single sanctioned hard delete (`session_replication_role = replica` disables the immutability/archive guards on the cascade), service-role only; `get_pending_workspace_deletion()` — definer read so a soft-deleted (RLS-hidden) tenant still surfaces its restore affordance to members. Soft-delete columns + request/cancel RPCs live in 0002. |
| `0017_fork_document_type.sql` | G0.1: `fork_document_type()` — atomically clones a Document Type (row + sections + approval roles) into a workspace as an editable copy (built-in → workspace fork, or workspace duplicate); invoker rights, 0004 admin-write policies govern the inserts. |
| `0018_generation_commit.sql` | G2.6/G2.5: `commit_generation()` — atomically turns a generation run into a Draft (document + revision + block tree + `block_spec_references` resolved to each field's **current** version); rejects references to unknown/cross-workspace or valueless fields and rolls back the whole commit (zero-hallucination, invariant 6); single-commit guard (idempotent retries, G8.1). Service-role only (revoked from clients); the app authorizes `doc.generate` first. |
| `0019_approval_workflow.sql` | C1.1–C1.3: `record_approval()` — an assigned approver's decision on a doc in Review, advancing the state machine atomically (reject → Draft with a mandatory reason; approve → Approved once every **required** Document-Type role has approved at the current cycle). Adds a `review_cycle` counter to `document_revisions` + `approval_records` so reset-on-rejection scopes (never deletes) the append-only audit trail. SECURITY DEFINER (approving is a viewer right, but the transition is editor-gated) — self-authorizes that the caller is assigned to the role. |

The assistant (Ask Arther) is session-scoped and adds no tables.

Written for Postgres 15+ / Supabase. With the Supabase CLI: drop them in `supabase/migrations/` (timestamp-prefix the filenames, e.g. `20260608090000_conventions.sql`) and run `supabase db push`, or run them directly against a database in order.

## The security model in one screen

Two access tiers, defence in depth ([ADR-010](../arther-adrs.md#adr-010)):

- **Authenticated app** connects with the user's JWT. **RLS is on**, so even a bug in application code cannot cross a workspace boundary. Policies are keyed on workspace membership via the `private.*` security-definer helpers (they bypass RLS internally, which is what makes membership checks recursion-safe).
- **Writes are role-aware at the row.** Four tiers: *member* writes only where the specs grant viewers writes (comments, approvals); *editor* (`is_workspace_editor` = owner/admin/member) for authoring content — so the paid-seat boundary survives a `canDo` regression; *admin* for Settings surfaces; *service-role-only* (no authenticated write policy) for pipeline-owned tables — `published_snapshots`, `generation_runs`, review states/diffs, `notifications`, `analytics_events`, `audit_log`.
- **Trusted server paths** (background jobs, the portal) use the **service role**, which bypasses RLS. They MUST scope every query by `workspace_id` through the `packages/db` data-access layer — the service role is never a tenancy escape hatch. Immutability triggers bind the service role too; the workspace purge job alone runs with `session_replication_role = replica` to perform the one sanctioned hard delete.

`canDo(user, action, resource)` in the app is the primary authorization authority (roles, seats, fine-grained rules). RLS is the second, independent layer that enforces tenant isolation — and now the seat boundary — at the row.

## Conventions worth knowing

- **Attribution** (`created_by/at`, `updated_by/at`) is on every **mutable** entity from day one (guardrail 2); append-only tables carry created-side attribution only. `updated_at` is maintained by trigger. `workspace_members.updated_at/by` doubles as the role-to-seat transition record for billing.
- **Immutability:** `field_versions`, `audit_log`, `approval_records`, `analytics_events`, access logs, `release_field_values`, and `published_snapshots` (content freeze + no-delete) reject mutation via triggers **and** carry no mutating policy — so even the service role can't rewrite history. Field versions still cascade-delete with their field (owner context), so a field can be hard-deleted when allowed — but users can never edit history. The purge job's `session_replication_role = replica` is the single sanctioned bypass.
- **Archive over delete** (invariant 7): entities with dependents carry `archived_at`; `BEFORE DELETE` guards + targeted FK `restrict` make hard delete impossible while references exist (guards cover components, fields, products↔releases/variants, documents↔snapshots, library items). The workspace root itself has no JWT delete path — soft delete + grace + purge job.
- **Workspace creation** goes through `select public.create_workspace('Name', 'slug')` — it inserts the workspace, the owner membership, and the built-in categories atomically under definer rights (resolving the RLS bootstrap chicken-and-egg). Don't `insert into workspaces` directly from the client.
- **UUIDs:** `gen_random_uuid()` (v4) by default; if your Postgres has a uuid v7 extension, switch the defaults for time-ordered, index-friendly keys.
- **Denormalised `workspace_id`** on child tables (e.g. `field_versions`, `spec_fields`) keeps RLS a single fast predicate instead of a join.

## Verify before trusting (the #1 missed control)

After applying, run the RLS probe (Phase 1 task F8.1): sign in as user A in workspace W1 and user B in workspace W2, then confirm B cannot `select`/`update` any of W1's rows through the JWT-authenticated client. Automate it in CI.

## v1 complete

Migrations `0001`–`0012` realise the full v1 data model across all four phases — every cross-phase foreign key is now wired (Content Reuse in `0009`, Variants in `0010`), and the 9 June architecture audit's schema findings are folded in: generation-run state, import sessions, FTS columns, the five built-in Document Types, release/snapshot immutability, role-aware policies, and workspace soft delete. The app-owned contracts to remember: the editor writes `blocks.text_content`, the publish pipeline writes `published_snapshots.search_text`, and pipelines (not clients) create snapshots and generation runs.

## Post-launch (pre-wired, additive — not in these migrations)

External Sync (the `SpecReconciler` is already shared and `spec_fields` already carries `provenance` / `sync_source_id` / `last_synced_at`), the billing admin UI (seat tier already derivable from role; role→seat timestamps to add when billing lands), SSO/SCIM (auth already decoupled via `users` ⇄ `auth_providers`), DOCX export, and the analytics warehouse lift-out (the `analytics_events` envelope is the seam). Each is designed to be additive rather than a migration of existing data.
