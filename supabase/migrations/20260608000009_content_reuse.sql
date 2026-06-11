-- ============================================================================
-- Arther — Migration 0009: Content Reuse
-- Block library (snippets + templates), snippet versioning, live-transclusion
-- embeds with the override model, and document duplication records.
-- Also wires the deferred snippet_id foreign keys from Phases 2-3.
-- Depends on: 0001-0008.
-- ============================================================================

-- --- Library items (a self-contained block sequence; snippet or template) ------
create table public.library_items (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('snippet','template')),
  owner_id    uuid references public.users(id),
  blocks      jsonb not null default '[]'::jsonb,        -- ordered block sequence (>=1)
  embed_count integer not null default 0,                -- denormalised; blocks hard-delete when > 0
  archived_at timestamptz,
  archived_by uuid references public.users(id),
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id),
  updated_at  timestamptz not null default now()
);
create index library_items_workspace_idx on public.library_items (workspace_id, type);
create trigger library_items_set_updated_at before update on public.library_items
  for each row execute function public.set_updated_at();

-- --- Snippet versions (each edit creates one; rollback target) -----------------
create table public.library_item_versions (
  version_id      uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  blocks_snapshot jsonb not null,
  change_note     text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now()
);
create index liv_item_idx on public.library_item_versions (library_item_id, created_at desc);

-- --- Snippet embeds (live transclusion with override model) --------------------
-- AUTHORITATIVE-SOURCE INVARIANT: the `blocks` row (source='snippet',
-- snippet_id) IS the placement — position comes from blocks.display_order.
-- This table carries only the embed STATE (override model, staleness), keyed
-- 1:1 to the placing block. Never store position here; on disagreement the
-- block row wins.
create table public.snippet_embeds (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  document_id              uuid not null references public.documents(id) on delete cascade,
  block_id                 uuid not null references public.blocks(id) on delete cascade,
  library_item_id          uuid not null references public.library_items(id) on delete restrict,
  state                    text not null default 'live'
                            check (state in ('live','overridden','source_changed')),
  override_blocks          jsonb,                          -- set when overridden / source_changed
  override_created_at      timestamptz,
  override_created_by      uuid references public.users(id),
  source_version_at_override uuid references public.library_item_versions(version_id) on delete set null,
  stale_prose_flag         boolean not null default false,
  stale_prose_resolved_locally boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_by               uuid references public.users(id),
  updated_at               timestamptz not null default now(),
  unique (block_id)
);
create index snippet_embeds_document_idx on public.snippet_embeds (document_id);
create index snippet_embeds_item_idx     on public.snippet_embeds (library_item_id);
create trigger snippet_embeds_set_updated_at before update on public.snippet_embeds
  for each row execute function public.set_updated_at();

-- --- Document duplication audit record -----------------------------------------
create table public.duplication_records (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete set null,
  new_document_id    uuid references public.documents(id) on delete set null,
  target_product_id  uuid references public.products(id) on delete set null,
  blocks_resolved     integer not null default 0,
  blocks_placeholdered integer not null default 0,
  blocks_carried_over integer not null default 0,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now()
);

-- --- Deletion protection: archive snippets with active embeds, don't delete -----
create or replace function public.guard_library_item_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.snippet_embeds where library_item_id = old.id) then
    raise exception 'Library item % has active embeds; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;
create trigger library_items_guard_delete before delete on public.library_items
  for each row execute function public.guard_library_item_hard_delete();

-- --- Wire deferred FKs from earlier phases ------------------------------------
alter table public.blocks
  add constraint blocks_snippet_fk
  foreign key (snippet_id) references public.library_items(id) on delete set null;

alter table public.snippet_review_items
  add constraint snippet_review_items_snippet_fk
  foreign key (snippet_id) references public.library_items(id) on delete cascade;

-- --- Row-Level Security -------------------------------------------------------
alter table public.library_items          enable row level security;
alter table public.library_item_versions  enable row level security;
alter table public.snippet_embeds         enable row level security;
alter table public.duplication_records    enable row level security;

-- Members read; editors write (viewers excluded). Library item versions are
-- append-only-ish: insert + read only (rollback creates a NEW version).
create policy library_items_read on public.library_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy library_items_write on public.library_items for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy liv_read on public.library_item_versions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy liv_insert on public.library_item_versions for insert to authenticated
  with check (private.is_workspace_editor(workspace_id));
create policy snippet_embeds_read on public.snippet_embeds for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy snippet_embeds_write on public.snippet_embeds for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy duplication_records_read on public.duplication_records for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy duplication_records_insert on public.duplication_records for insert to authenticated
  with check (private.is_workspace_editor(workspace_id));
