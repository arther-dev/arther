-- ============================================================================
-- Arther — Migration 0002: Identity & Workspace
-- Decoupled identity (users <-> auth_providers), workspaces, membership,
-- invitations, the recursion-safe tenancy helpers, and RLS.
-- Depends on: 0001.
-- ============================================================================

-- --- App-level identity (decoupled from provider; guardrail 3) ----------------
-- public.users mirrors auth.users but holds the NORMALISED identity the app uses.
-- Provider specifics live in auth_providers, so SSO is an additive provider later.
create table public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      citext not null unique,
  name       text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create table public.auth_providers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  provider         text not null,            -- 'email' | 'google' | 'saml' (later)
  provider_user_id text not null,
  created_at       timestamptz not null default now(),
  unique (provider, provider_user_id)
);
create index auth_providers_user_idx on public.auth_providers (user_id);

-- --- Workspaces (tenant root) -------------------------------------------------
create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       citext not null unique,         -- immutable after creation (portal subdomain)
  logo_url   text,
  owner_id   uuid not null references public.users(id),
  -- Soft delete with a grace period (archive-not-delete philosophy applied to the
  -- tenant root). Deletion is requested via request_workspace_deletion() below;
  -- the purge-deleted-workspaces job hard-deletes after purge_after. The slug
  -- stays reserved during the grace period (prevents hostile re-registration).
  deleted_at             timestamptz,
  purge_after            timestamptz,
  deletion_requested_by  uuid references public.users(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);
create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

-- Enforce slug immutability at the database (breaking it breaks every portal URL).
create or replace function public.guard_workspace_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'workspaces.slug is immutable';
  end if;
  return new;
end;
$$;
create trigger workspaces_slug_immutable before update on public.workspaces
  for each row execute function public.guard_workspace_slug();

-- --- Membership & invitations -------------------------------------------------
create table public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         text not null check (role in ('owner','admin','member','viewer')),
  invited_by   uuid references public.users(id),
  joined_at    timestamptz not null default now(),
  -- Role changes are seat changes (Editor paid / Viewer free) — attribute them.
  -- updated_at is the role-to-seat transition timestamp the billing UI will read.
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);
create index workspace_members_ws_idx   on public.workspace_members (workspace_id);
create trigger workspace_members_set_updated_at before update on public.workspace_members
  for each row execute function public.set_updated_at();

create table public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        citext not null,
  role         text not null check (role in ('admin','member')),  -- owner is not invitable
  invited_by   uuid not null references public.users(id),
  invited_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  revoked_at   timestamptz
);
create index workspace_invitations_ws_idx    on public.workspace_invitations (workspace_id);
create index workspace_invitations_email_idx on public.workspace_invitations (email);

-- --- Tenancy helpers (security definer => bypass RLS => recursion-safe) --------
-- Policies that filter workspace_members must NOT re-query workspace_members under
-- RLS or they recurse. These helpers run as definer (RLS off) to break the cycle.
-- All helpers exclude soft-deleted workspaces: the moment deletion is requested,
-- the workspace disappears from every member's view (restore via RPC below).
create or replace function private.current_workspace_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select m.workspace_id
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id and w.deleted_at is null
  where m.user_id = auth.uid();
$$;

create or replace function private.is_workspace_member(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id and w.deleted_at is null
    where m.user_id = auth.uid() and m.workspace_id = ws
  );
$$;

create or replace function private.has_workspace_role(ws uuid, roles text[])
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id and w.deleted_at is null
    where m.user_id = auth.uid() and m.workspace_id = ws and m.role = any(roles)
  );
$$;

-- Write-tier check: owner/admin/member may write content; VIEWERS MAY NOT.
-- This backstops the Editor-seat (paid) vs Viewer-seat (free) boundary at the
-- row, so a canDo regression cannot silently grant free seats write access.
-- Viewers keep their spec'd writes: comments and approval records only.
create or replace function private.is_workspace_editor(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select private.has_workspace_role(ws, array['owner','admin','member']);
$$;

create or replace function private.shares_workspace(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- --- Mirror auth.users -> public.users on signup ------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- Row-Level Security -------------------------------------------------------
alter table public.users                 enable row level security;
alter table public.auth_providers        enable row level security;
alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.workspace_invitations enable row level security;

-- users: self + co-members readable; self updatable.
create policy users_read on public.users for select to authenticated
  using (id = auth.uid() or private.shares_workspace(id));
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- auth_providers: only the owning user.
create policy auth_providers_self on public.auth_providers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- workspaces: members read; admins/owner update. There is deliberately NO delete
-- policy: a JWT client can never hard-delete the tenant root (one statement would
-- otherwise cascade away every product, document, and published portal). Deletion
-- is a two-step soft delete via request_workspace_deletion() below; the
-- purge-deleted-workspaces job (service role) hard-deletes after the grace period.
-- Creation goes through public.create_workspace() (defined in 0003) so the owner
-- membership row is inserted atomically under definer rights — hence no INSERT policy.
create policy workspaces_read on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.has_workspace_role(id, array['owner','admin']))
  with check (private.has_workspace_role(id, array['owner','admin']));

-- workspace_members: members read; admins/owner manage.
create policy members_read on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy members_write on public.workspace_members for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));

-- invitations: admins/owner manage and read.
create policy invitations_manage on public.workspace_invitations for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));

-- --- Workspace deletion: soft delete + grace period ----------------------------
-- Owner-only. Sets deleted_at/purge_after; the tenancy helpers then hide the
-- workspace from every member immediately. Reversible until purge_after via
-- cancel_workspace_deletion(). The purge job hard-deletes expired workspaces
-- under the service role using `set session_replication_role = replica` so the
-- archive/immutability guards (which fire even on cascade) don't block the purge.
-- Both RPCs check membership directly (not via the helpers) because the helpers
-- exclude soft-deleted workspaces by design.
create or replace function public.request_workspace_deletion(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = v_uid and role = 'owner'
  ) then
    raise exception 'only the workspace owner may request deletion';
  end if;
  update public.workspaces
     set deleted_at = now(),
         purge_after = now() + interval '14 days',
         deletion_requested_by = v_uid,
         updated_by = v_uid
   where id = p_workspace_id and deleted_at is null;
  if not found then
    raise exception 'workspace not found or already pending deletion';
  end if;
  insert into public.audit_log (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (p_workspace_id, v_uid, 'workspace.deletion_requested', 'workspace', p_workspace_id,
          jsonb_build_object('purge_after', now() + interval '14 days'));
end;
$$;

create or replace function public.cancel_workspace_deletion(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = v_uid and role = 'owner'
  ) then
    raise exception 'only the workspace owner may cancel deletion';
  end if;
  update public.workspaces
     set deleted_at = null, purge_after = null, deletion_requested_by = null, updated_by = v_uid
   where id = p_workspace_id and deleted_at is not null and purge_after > now();
  if not found then
    raise exception 'workspace is not pending deletion (or the grace period has expired)';
  end if;
  insert into public.audit_log (workspace_id, actor_id, action, resource_type, resource_id)
  values (p_workspace_id, v_uid, 'workspace.deletion_cancelled', 'workspace', p_workspace_id);
end;
$$;
