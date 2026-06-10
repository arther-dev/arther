-- ============================================================================
-- Arther — Migration 0011: Analytics
-- A single append-only event store with the shared envelope. The spec defers the
-- warehouse; metrics are SQL aggregates at launch. Partition by month at volume;
-- the envelope is the lift-out seam to ClickHouse/BigQuery/PostHog later.
-- Depends on: 0001-0010.
-- ============================================================================

create table public.analytics_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  event_type    text not null,                  -- portal: document_viewed | document_downloaded | portal_searched
                                                 -- workspace: document_generated | document_state_changed |
                                                 --            block_regenerated | spec_field_updated
  actor_user_id uuid references public.users(id),   -- set for workspace events
  session_id    text,                            -- set for portal events (anonymous)
  magic_link_id uuid references public.magic_links(id) on delete set null, -- restricted-doc identity
  document_id   uuid references public.documents(id) on delete set null,
  payload       jsonb not null default '{}'::jsonb,   -- event-specific fields
  occurred_at   timestamptz not null default now()
);
create index analytics_events_ws_type_time_idx on public.analytics_events (workspace_id, event_type, occurred_at desc);
create index analytics_events_document_idx      on public.analytics_events (document_id, occurred_at desc);

-- Append-only.
create trigger analytics_events_no_update before update on public.analytics_events
  for each row execute function public.prevent_mutation();
create trigger analytics_events_no_delete before delete on public.analytics_events
  for each row execute function public.prevent_mutation();

-- --- Row-Level Security -------------------------------------------------------
-- Events are written by trusted server paths (portal + app/jobs via the service
-- role, which bypasses RLS): no authenticated INSERT policy. Members may read
-- their workspace's events; canDo restricts the admin-only surfaces in the app.
alter table public.analytics_events enable row level security;

create policy analytics_read on public.analytics_events for select to authenticated
  using (private.is_workspace_member(workspace_id));
