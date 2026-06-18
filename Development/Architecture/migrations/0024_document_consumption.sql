-- ============================================================================
-- Arther — Migration 0024: Per-document consumption metrics (A.5)
-- A single SQL aggregate over the append-only analytics_events store (the spec
-- defers a warehouse; metrics are SQL aggregates at launch). Returns the portal
-- consumption for one document: total views, unique anonymous visitors (distinct
-- session_id), downloads, and identified viewers (distinct magic_link_id, the
-- gated-doc recipients). SECURITY INVOKER (default) — the caller's RLS on
-- analytics_events governs, so a member only ever sees their own workspace's
-- events (a document in another tenant returns zeros, never a leak).
-- Depends on: 0011.
-- ============================================================================

create or replace function public.document_consumption(p_document_id uuid)
returns table (
  views              bigint,
  unique_visitors    bigint,
  downloads          bigint,
  identified_viewers bigint
)
language sql
stable
-- security invoker (default): the caller's analytics_read RLS scopes every row.
set search_path = public
as $$
  select
    count(*) filter (where event_type = 'document_viewed'),
    count(distinct session_id) filter (where event_type = 'document_viewed'),
    count(*) filter (where event_type = 'document_downloaded'),
    count(distinct magic_link_id) filter (where magic_link_id is not null)
  from public.analytics_events
  where document_id = p_document_id;
$$;
