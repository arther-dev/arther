-- ============================================================================
-- Arther — LOCAL/CI auth shim. NEVER apply to a real Supabase project.
--
-- Plain postgres:17 lacks the surface GoTrue provides on Supabase. The
-- migrations (0002+) depend on: the anon/authenticated/service_role roles,
-- the auth schema with auth.users, and auth.uid()/auth.role()/auth.jwt().
-- This shim recreates that minimal surface with definitions equivalent to
-- Supabase's own (auth.uid() reads request.jwt.claims), so the same SQL and
-- the same RLS probes run identically here and on a provisioned project.
-- ============================================================================

-- --- Roles ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- --- auth schema + minimal auth.users -------------------------------------
-- Only the columns the migrations read: handle_new_user() uses id, email,
-- raw_user_meta_data; public.users(id) references auth.users(id).
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- --- JWT claim readers (Supabase-compatible definitions) -------------------
create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_setting('role', true))
$$;

-- --- Grants (mirror the Supabase image's defaults for the API roles) -------
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
