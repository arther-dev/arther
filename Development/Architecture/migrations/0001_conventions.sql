-- ============================================================================
-- Arther — Migration 0001: Conventions
-- Extensions, the `private` helper schema, generic triggers, and the audit log.
-- Everything later migrations rely on. Apply first.
-- ============================================================================

-- --- Extensions ---------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- trigram fuzzy search
create extension if not exists citext;     -- case-insensitive email / slug
-- Optional: time-ordered UUIDs (preferred for PKs). If the pg_uuidv7 extension
-- is available in your Postgres, enable it and default PKs to uuid_generate_v7().
-- create extension if not exists pg_uuidv7;

-- --- Schemas ------------------------------------------------------------------
-- Security-definer helpers live in `private` so they are never exposed via the
-- auto-generated API. They bypass RLS by design (recursion-safe membership checks).
create schema if not exists private;

-- --- Generic triggers ---------------------------------------------------------

-- Maintain updated_at on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Reject any mutation of an append-only row. Belt-and-suspenders on top of RLS
-- (used for truly immutable tables; see field_versions, audit_log).
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Rows in %.% are immutable and cannot be %',
    tg_table_schema, tg_table_name, lower(tg_op);
end;
$$;

-- --- Audit log (append-only) --------------------------------------------------
-- No foreign keys: attribution must survive deletion of the actor or resource
-- ("attribution is permanent", PRD §7.13). Written by trusted server paths
-- (service role); never by the authenticated client directly.
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  actor_id      uuid,                                   -- public.users(id); null = system
  action        text not null,                          -- e.g. 'document.published'
  resource_type text not null,
  resource_id   uuid,
  metadata      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

create index audit_log_workspace_time_idx on public.audit_log (workspace_id, occurred_at desc);
create index audit_log_resource_idx       on public.audit_log (resource_type, resource_id);

alter table public.audit_log enable row level security;
-- No policies for `authenticated`/`anon` => only the service role (which bypasses
-- RLS) can read or write the audit log. The app surfaces it via trusted paths.

create trigger audit_log_no_update before update on public.audit_log
  for each row execute function public.prevent_mutation();
create trigger audit_log_no_delete before delete on public.audit_log
  for each row execute function public.prevent_mutation();
