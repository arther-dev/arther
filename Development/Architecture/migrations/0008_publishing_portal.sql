-- ============================================================================
-- Arther — Migration 0008: Publishing Portal & Export
-- Frozen published snapshots (the one sanctioned copy of resolved spec values),
-- magic-link gated access + access logs, and custom domains.
-- Depends on: 0001-0007.
-- ============================================================================

-- --- Published snapshots (frozen, versioned artifacts; invariants 1 & 5) -------
-- block_tree + resolution_manifest + version (and identity/attribution columns)
-- are CONTENT and immutable after insert (guard below). Only the operational
-- columns may change: pdf_ready / pdf_storage_key (PDF completion), search_text
-- (publish-time extraction), access_config (access changes without republish),
-- and archived_at/archived_by (unpublish = archive — snapshots are NEVER
-- deleted; the portal simply stops serving archived versions).
create table public.published_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  document_id         uuid not null references public.documents(id) on delete cascade,
  product_id          uuid not null references public.products(id) on delete restrict,
  variant_id          uuid,                              -- FK to product_variants added in Variants phase
  version             text not null,                     -- semantic: '1.0', '1.1', '2.0'
  block_tree          jsonb not null,                    -- fully resolved; no live references
  resolution_manifest jsonb not null default '[]'::jsonb,
  pdf_storage_key     text,
  pdf_ready           boolean not null default false,
  access_config       jsonb not null default '{"access":"public"}'::jsonb,
  -- Portal search: plain-text projection of block_tree, extracted by the publish
  -- pipeline (M1: portal search indexes the LATEST release only — the portal
  -- query filters to each document's newest non-archived snapshot).
  search_text         text,
  search_tsv          tsvector generated always as (to_tsvector('english', coalesce(search_text, ''))) stored,
  archived_at         timestamptz,
  archived_by         uuid references public.users(id),
  published_by        uuid references public.users(id),
  published_at        timestamptz not null default now(),
  unique (document_id, version)
);
create index published_snapshots_document_idx on public.published_snapshots (document_id, published_at desc);
create index published_snapshots_product_idx  on public.published_snapshots (product_id);
create index published_snapshots_workspace_idx on public.published_snapshots (workspace_id);
create index published_snapshots_fts_idx on public.published_snapshots using gin (search_tsv);

-- Freeze all content/identity columns; allow only the operational columns
-- (pdf_*, search_text, access_config, archived_*) to change after insert.
create or replace function public.guard_snapshot_frozen()
returns trigger language plpgsql as $$
begin
  if new.block_tree             is distinct from old.block_tree
     or new.resolution_manifest is distinct from old.resolution_manifest
     or new.version             is distinct from old.version
     or new.document_id         is distinct from old.document_id
     or new.workspace_id        is distinct from old.workspace_id
     or new.product_id          is distinct from old.product_id
     or new.variant_id          is distinct from old.variant_id
     or new.published_by        is distinct from old.published_by
     or new.published_at        is distinct from old.published_at then
    raise exception 'Published snapshot content is frozen; create a new revision to change content';
  end if;
  return new;
end;
$$;
create trigger published_snapshots_freeze before update on public.published_snapshots
  for each row execute function public.guard_snapshot_frozen();

-- Snapshots are never deleted (publish history is the compliance artifact).
-- Unpublish = set archived_at. The only sanctioned removal is the workspace
-- purge job, which runs with session_replication_role = replica (disables this).
create trigger published_snapshots_no_delete before delete on public.published_snapshots
  for each row execute function public.prevent_mutation();

-- Access changes are security-sensitive (a flip from allowlist to public exposes
-- the document): write an audit row on every access_config change. SECURITY
-- DEFINER so the insert passes audit_log's deny-all RLS regardless of caller.
create or replace function public.audit_snapshot_access_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.access_config is distinct from old.access_config then
    insert into public.audit_log (workspace_id, actor_id, action, resource_type, resource_id, metadata)
    values (new.workspace_id, auth.uid(), 'snapshot.access_config_changed', 'published_snapshot', new.id,
            jsonb_build_object('old', old.access_config, 'new', new.access_config));
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into public.audit_log (workspace_id, actor_id, action, resource_type, resource_id, metadata)
    values (new.workspace_id, auth.uid(),
            case when new.archived_at is null then 'snapshot.restored' else 'snapshot.archived' end,
            'published_snapshot', new.id, '{}'::jsonb);
  end if;
  return new;
end;
$$;
create trigger published_snapshots_audit_access after update on public.published_snapshots
  for each row execute function public.audit_snapshot_access_change();

-- --- Magic links (lightweight gated access; NOT workspace accounts) ------------
create table public.magic_links (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  email       citext not null,
  token_hash  text not null unique,                  -- store a hash, never the raw token
  type        text not null check (type in ('open','allowlist')),
  expires_at  timestamptz not null,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index magic_links_document_idx on public.magic_links (document_id);
create index magic_links_email_idx    on public.magic_links (email);

-- Magic-link issuance/revocation is an external-access grant — audit both.
create or replace function public.audit_magic_link_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (workspace_id, actor_id, action, resource_type, resource_id, metadata)
    values (new.workspace_id, auth.uid(), 'magic_link.issued', 'magic_link', new.id,
            jsonb_build_object('document_id', new.document_id, 'type', new.type, 'expires_at', new.expires_at));
  elsif tg_op = 'UPDATE' and new.revoked_at is distinct from old.revoked_at then
    insert into public.audit_log (workspace_id, actor_id, action, resource_type, resource_id, metadata)
    values (new.workspace_id, auth.uid(), 'magic_link.revoked', 'magic_link', new.id,
            jsonb_build_object('document_id', new.document_id));
  end if;
  return new;
end;
$$;
create trigger magic_links_audit after insert or update on public.magic_links
  for each row execute function public.audit_magic_link_change();

-- --- Magic-link access log (append-only; analytics + audit) --------------------
create table public.magic_link_access_logs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  magic_link_id uuid references public.magic_links(id) on delete set null,
  document_id   uuid references public.documents(id) on delete set null,
  accessed_at   timestamptz not null default now(),
  ip_hash       text                                  -- hashed; no raw PII
);
create index mlal_document_idx on public.magic_link_access_logs (document_id, accessed_at desc);
create trigger mlal_no_update before update on public.magic_link_access_logs
  for each row execute function public.prevent_mutation();
create trigger mlal_no_delete before delete on public.magic_link_access_logs
  for each row execute function public.prevent_mutation();

-- --- Custom domains -----------------------------------------------------------
create table public.custom_domains (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain       citext not null unique,
  status       text not null default 'pending' check (status in ('pending','verifying','active','error')),
  verified_at  timestamptz,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now()
);
create index custom_domains_workspace_idx on public.custom_domains (workspace_id);
create trigger custom_domains_set_updated_at before update on public.custom_domains
  for each row execute function public.set_updated_at();

-- --- Row-Level Security -------------------------------------------------------
-- The portal reads these via the service role (RLS bypassed) scoped by host /
-- workspace; the policies below govern the AUTHENTICATED app (authors/admins).
alter table public.published_snapshots     enable row level security;
alter table public.magic_links             enable row level security;
alter table public.magic_link_access_logs  enable row level security;
alter table public.custom_domains          enable row level security;

-- Published snapshots: members READ ONLY. There is deliberately no INSERT
-- policy (snapshots are created exclusively by the publish pipeline under the
-- service role, after the approval state machine — a JWT client must never be
-- able to forge a publication), no DELETE policy (history is immutable; the
-- no-delete trigger backstops the service role too), and UPDATE is admin-gated
-- (the freeze guard limits it to pdf_*, search_text, access_config, archived_*).
create policy snapshots_read on public.published_snapshots for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy snapshots_admin_update on public.published_snapshots for update to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));

-- Magic links: members read; EDITORS issue and revoke (viewers — the external-
-- collaborator seat — must not be able to mint external access). No delete
-- policy: revocation is `revoked_at`, preserving the issuance audit trail.
create policy magic_links_read on public.magic_links for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy magic_links_insert on public.magic_links for insert to authenticated
  with check (private.is_workspace_editor(workspace_id));
create policy magic_links_update on public.magic_links for update to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));

create policy mlal_read on public.magic_link_access_logs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy custom_domains_rw on public.custom_domains for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));
