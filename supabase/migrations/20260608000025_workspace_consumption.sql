-- ============================================================================
-- Arther — Migration 0025: Workspace consumption analytics (A.6)
-- The admin (owner/admin via canDo) consumption surfaces over analytics_events:
--   • workspace_document_consumption — per-document views / unique visitors /
--     downloads across the workspace (the cross-document comparison);
--   • workspace_top_searches — the most-run portal queries;
--   • workspace_zero_result_searches — queries that returned nothing (the
--     content-gap signal: what readers look for and don't find).
-- All SECURITY INVOKER (default) — the caller's analytics_read RLS scopes every
-- row to their own workspace; the p_workspace_id arg pins the active one.
-- Depends on: 0011.
-- ============================================================================

create or replace function public.workspace_document_consumption(p_workspace_id uuid)
returns table (
  document_id     uuid,
  title           text,
  views           bigint,
  unique_visitors bigint,
  downloads       bigint
)
language sql
stable
set search_path = public
as $$
  select
    e.document_id,
    d.title,
    count(*) filter (where e.event_type = 'document_viewed'),
    count(distinct e.session_id) filter (where e.event_type = 'document_viewed'),
    count(*) filter (where e.event_type = 'document_downloaded')
  from public.analytics_events e
  join public.documents d on d.id = e.document_id
  where e.workspace_id = p_workspace_id
    and e.document_id is not null
    and e.event_type in ('document_viewed', 'document_downloaded')
  group by e.document_id, d.title
  order by 3 desc, 5 desc, d.title;
$$;

create or replace function public.workspace_top_searches(p_workspace_id uuid, p_limit int default 20)
returns table (query text, searches bigint)
language sql
stable
set search_path = public
as $$
  select payload->>'query', count(*)
  from public.analytics_events
  where workspace_id = p_workspace_id
    and event_type = 'portal_searched'
    and coalesce(payload->>'query', '') <> ''
  group by payload->>'query'
  order by 2 desc, 1
  limit greatest(p_limit, 1);
$$;

create or replace function public.workspace_zero_result_searches(p_workspace_id uuid, p_limit int default 20)
returns table (query text, searches bigint)
language sql
stable
set search_path = public
as $$
  select payload->>'query', count(*)
  from public.analytics_events
  where workspace_id = p_workspace_id
    and event_type = 'portal_searched'
    and coalesce(payload->>'query', '') <> ''
    and coalesce((payload->>'results')::int, 0) = 0
  group by payload->>'query'
  order by 2 desc, 1
  limit greatest(p_limit, 1);
$$;
