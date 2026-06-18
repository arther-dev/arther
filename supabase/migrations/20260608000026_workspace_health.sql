-- ============================================================================
-- Arther — Migration 0026: Workspace operational-health metrics (A.7)
-- The admin (owner/admin) workspace-health surface: generation success,
-- approval rejection rate, and the live stale-reference count — drawn from the
-- operational tables (generation_runs, approval_records) and the spec-tracking
-- state (block_spec_references vs spec_fields.current_version_id), not the
-- analytics event store. SECURITY INVOKER (default) — the caller's RLS on each
-- source table scopes the counts to their own workspace. Review *cycle time*
-- (paired submit→decision durations) is a follow-up.
-- Depends on: 0003, 0005, 0006, 0007.
-- ============================================================================

create or replace function public.workspace_health(p_workspace_id uuid)
returns table (
  generations_total     bigint,
  generations_succeeded bigint,
  generations_failed    bigint,
  approvals_total       bigint,
  approvals_rejected    bigint,
  stale_documents       bigint
)
language sql
stable
set search_path = public
as $$
  select
    (select count(*) from public.generation_runs
       where workspace_id = p_workspace_id
         and status in ('succeeded', 'failed', 'partial', 'cancelled')),
    (select count(*) from public.generation_runs
       where workspace_id = p_workspace_id and status = 'succeeded'),
    (select count(*) from public.generation_runs
       where workspace_id = p_workspace_id and status = 'failed'),
    (select count(*) from public.approval_records
       where workspace_id = p_workspace_id and action in ('approved', 'rejected')),
    (select count(*) from public.approval_records
       where workspace_id = p_workspace_id and action = 'rejected'),
    (select count(distinct bsr.document_id)
       from public.block_spec_references bsr
       join public.spec_fields sf on sf.id = bsr.field_id
       where bsr.workspace_id = p_workspace_id
         and sf.current_version_id is not null
         and sf.current_version_id <> bsr.field_version_id);
$$;
