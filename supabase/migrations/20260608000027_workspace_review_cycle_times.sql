-- ============================================================================
-- Arther — Migration 0027: Review cycle times (A — analytics)
-- The 4th admin workspace-health metric deferred from A.7: how long documents
-- spend in review and how often they loop. A "review cycle" is a submit→decision
-- pair — the time from when a revision entered Review (the most recent
-- `document_state_changed` event with payload to='review' before the decision) to
-- the approval/rejection recorded in `approval_records`. Computed from
-- member-readable tables only; SECURITY INVOKER (default) so each source table's
-- RLS scopes the rows to the caller's workspace.
-- Depends on: 0005, 0007, 0011.
-- ============================================================================

create or replace function public.workspace_review_cycle_times(p_workspace_id uuid)
returns table (
  reviews_measured          bigint,
  approvals                 bigint,
  rejections                bigint,
  avg_hours_to_decision     double precision,
  median_hours_to_decision  double precision
)
language sql
stable
set search_path = public
as $$
  with decisions as (
    select
      ar.recorded_at as decided_at,
      ar.action,
      (
        select max(ae.occurred_at)
        from public.analytics_events ae
        where ae.workspace_id = p_workspace_id
          and ae.document_id = dr.document_id
          and ae.event_type = 'document_state_changed'
          and ae.payload->>'to' = 'review'
          and ae.occurred_at <= ar.recorded_at
      ) as submitted_at
    from public.approval_records ar
    join public.document_revisions dr on dr.id = ar.revision_id
    where ar.workspace_id = p_workspace_id
      and ar.action in ('approved', 'rejected')
  ),
  measured as (
    select action, extract(epoch from (decided_at - submitted_at)) / 3600.0 as hours
    from decisions
    where submitted_at is not null
      and decided_at >= submitted_at
  )
  select
    count(*)::bigint,
    count(*) filter (where action = 'approved')::bigint,
    count(*) filter (where action = 'rejected')::bigint,
    avg(hours)::double precision,
    percentile_cont(0.5) within group (order by hours)::double precision
  from measured;
$$;
