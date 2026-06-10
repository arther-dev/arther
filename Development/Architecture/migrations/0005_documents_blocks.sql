-- ============================================================================
-- Arther — Migration 0005: Documents & Blocks
-- Documents, revisions (Draft used this phase; full state machine in Phase 3),
-- the block tree, the three reference tables that power Smart Spec Tracking,
-- generation run state (per-section progress, the Realtime subscription target),
-- and in-app full-text search columns. Also extends the archive guards.
-- Depends on: 0001, 0002, 0003, 0004.
-- ============================================================================

-- --- Documents ----------------------------------------------------------------
create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  product_id         uuid not null references public.products(id) on delete restrict,
  document_type_id   uuid not null references public.document_types(id),
  brand_profile_id   uuid references public.brand_profiles(id),
  title              text not null,
  slug               text not null,
  owner_id           uuid references public.users(id),
  current_revision_id uuid,                                  -- FK added after revisions exist
  archived_at        timestamptz,
  archived_by        uuid references public.users(id),
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references public.users(id),
  updated_at         timestamptz not null default now(),
  unique (product_id, slug)
);
create index documents_workspace_idx on public.documents (workspace_id);
create index documents_product_idx   on public.documents (product_id);
create index documents_title_trgm_idx on public.documents using gin (title gin_trgm_ops);
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- Publish history must survive everything short of a workspace purge: block
-- document hard-delete while published snapshots exist (archive instead).
-- (published_snapshots arrives in 0008; the guard is created here so every
--  later migration inherits it — the reference is by name, resolved at run time.)
create or replace function public.guard_document_hard_delete()
returns trigger language plpgsql as $$
begin
  if to_regclass('public.published_snapshots') is not null and exists (
    select 1 from public.published_snapshots where document_id = old.id
  ) then
    raise exception 'Document % has published snapshots; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;
create trigger documents_guard_delete before delete on public.documents
  for each row execute function public.guard_document_hard_delete();

-- --- Revisions (the working-copy + lifecycle state) ---------------------------
create table public.document_revisions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  document_id     uuid not null references public.documents(id) on delete cascade,
  revision_number integer not null,
  state           text not null default 'draft'
                    check (state in ('draft','review','approved','published')),
  review_brief    text,
  review_due_date timestamptz,
  published_at    timestamptz,
  published_by    uuid references public.users(id),
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  -- State transitions (submit / return / approve-complete) are the review
  -- workflow's spine — attribute them (guardrail 2).
  updated_by      uuid references public.users(id),
  updated_at      timestamptz not null default now(),
  unique (document_id, revision_number)
);
create index document_revisions_document_idx on public.document_revisions (document_id);
create index document_revisions_due_idx on public.document_revisions (review_due_date)
  where (state = 'review');   -- the review-reminders cron scans this
create trigger document_revisions_set_updated_at before update on public.document_revisions
  for each row execute function public.set_updated_at();

-- Wire the circular pointer: documents.current_revision_id -> document_revisions.id
alter table public.documents
  add constraint documents_current_revision_fk
  foreign key (current_revision_id) references public.document_revisions(id) on delete set null;

-- --- Blocks (the working-copy block tree) -------------------------------------
-- `content` holds RichTextContent or block-type props as JSONB (validated by Zod).
-- `section` is NOT stored — it is computed at read time from the nearest section
-- header above the block (per the editor spec).
create table public.blocks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  document_id     uuid not null references public.documents(id) on delete cascade,
  revision_id     uuid not null references public.document_revisions(id) on delete cascade,
  type            text not null check (type in (
                    'section_header','divider','page_break','toc',
                    'heading','paragraph','code_block','callout',
                    'spec_table','chart',
                    'warning','caution','note',
                    'image','video','gif','hotspot_image',
                    'accordion','step_wizard',
                    'snippet')),
  parent_block_id uuid references public.blocks(id) on delete cascade,   -- one-level containers
  display_order   integer not null default 0,
  source          text not null check (source in
                    ('spec','brief','placeholder','manual','snippet','structural')),
  snippet_id      uuid,                                  -- FK to library_items added in Content Reuse phase
  content         jsonb not null default '{}'::jsonb,
  degradation     jsonb not null default '{}'::jsonb,
  -- In-app search: the editor writes the block's plain-text projection here on
  -- every save (extraction is app-owned — the rich-text tree in `content` is
  -- not parseable by an immutable SQL function). The tsvector is derived.
  text_content    text,
  text_search     tsvector generated always as (to_tsvector('english', coalesce(text_content, ''))) stored,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  last_edited_by  uuid references public.users(id),
  last_edited_at  timestamptz
);
create index blocks_revision_idx on public.blocks (revision_id, display_order);
create index blocks_document_idx on public.blocks (document_id);
create index blocks_parent_idx   on public.blocks (parent_block_id);
create index blocks_fts_idx      on public.blocks using gin (text_search);

-- --- Block reference tables (the tracking spine) ------------------------------
create table public.block_spec_references (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  block_id         uuid not null references public.blocks(id) on delete cascade,
  document_id      uuid not null references public.documents(id) on delete cascade,
  field_id         uuid not null references public.spec_fields(id) on delete cascade,
  field_version_id uuid not null references public.field_versions(id) on delete cascade,  -- staleness anchor
  release_id       uuid references public.product_releases(id) on delete set null,
  variant_id       uuid,                                  -- FK to product_variants added in Variants phase
  reference_type   text not null default 'generated'
                    check (reference_type in ('generated','manually_linked','chart'))
);
-- Staleness join: WHERE field_version_id <> spec_fields.current_version_id
create index bsr_staleness_idx on public.block_spec_references (field_id, field_version_id);
create index bsr_document_idx  on public.block_spec_references (document_id);
create index bsr_block_idx     on public.block_spec_references (block_id);
create index bsr_variant_idx   on public.block_spec_references (variant_id);

create table public.block_brief_references (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  block_id        uuid not null references public.blocks(id) on delete cascade,
  document_id     uuid not null references public.documents(id) on delete cascade,
  brief_id        uuid not null references public.product_briefs(id) on delete cascade,
  fragment_key    text not null,
  content_snapshot text,
  generated_at    timestamptz not null default now(),
  unique (block_id)
);
create index bbr_brief_idx on public.block_brief_references (brief_id, fragment_key);

create table public.placeholder_brief_references (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  block_id     uuid not null references public.blocks(id) on delete cascade,
  document_id  uuid not null references public.documents(id) on delete cascade,
  entity_type  text not null check (entity_type in ('product','component')),
  entity_id    uuid not null,
  fragment_key text not null,
  section_name text,
  unique (block_id)
);
create index pbr_waiting_idx on public.placeholder_brief_references (entity_type, entity_id, fragment_key);

-- --- Generation runs (architecture §5.1 / §7: per-section progress persisted) --
-- The durable task orchestrates; THIS is the persisted state the product reads:
-- the Realtime subscription target for live progress, the resume record for
-- partial failure + section-level retry, and the per-workspace token/cost
-- accounting row (the metering hook v1 deliberately doesn't bill on).
create table public.generation_runs (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  variant_id        uuid,                                 -- FK to product_variants added in Variants phase
  document_type_id  uuid not null references public.document_types(id),
  brand_profile_id  uuid references public.brand_profiles(id) on delete set null,
  document_id       uuid references public.documents(id) on delete set null,  -- set on commit
  kind              text not null default 'document' check (kind in
                      ('document','variant_set','block_regeneration')),
  status            text not null default 'queued' check (status in
                      ('queued','running','partial','succeeded','failed','cancelled')),
  error             text,
  trigger_run_id    text,                                 -- Trigger.dev run handle
  model             text,                                 -- backend-configured Claude model used
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  requested_by      uuid references public.users(id),
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  updated_at        timestamptz not null default now()
);
create index generation_runs_ws_idx  on public.generation_runs (workspace_id, created_at desc);
create index generation_runs_doc_idx on public.generation_runs (document_id);
create trigger generation_runs_set_updated_at before update on public.generation_runs
  for each row execute function public.set_updated_at();

create table public.generation_run_sections (
  id                        uuid primary key default gen_random_uuid(),
  workspace_id              uuid not null references public.workspaces(id) on delete cascade,
  run_id                    uuid not null references public.generation_runs(id) on delete cascade,
  document_type_section_id  uuid references public.document_type_sections(id) on delete set null,
  name                      text not null,
  display_order             integer not null default 0,
  status                    text not null default 'pending' check (status in
                              ('pending','running','succeeded','failed','skipped')),
  attempt                   integer not null default 0,    -- section-level retry counter
  error                     text,
  input_tokens              integer not null default 0,
  output_tokens             integer not null default 0,
  produced_block_ids        jsonb not null default '[]'::jsonb,
  started_at                timestamptz,
  completed_at              timestamptz,
  updated_at                timestamptz not null default now()
);
create index grs_run_idx on public.generation_run_sections (run_id, display_order);
create trigger grs_set_updated_at before update on public.generation_run_sections
  for each row execute function public.set_updated_at();

-- --- Extend archive guards to cover block references (promised in 0003) --------
create or replace function public.guard_component_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.product_components where component_id = old.id) then
    raise exception 'Component % is used by products; archive it instead of deleting', old.id;
  end if;
  if exists (
    select 1 from public.block_spec_references bsr
    join public.spec_fields f on f.id = bsr.field_id
    where f.component_id = old.id
  ) then
    raise exception 'Component % is referenced by document blocks; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;

create or replace function public.guard_field_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.product_component_overrides where field_id = old.id)
     or exists (select 1 from public.release_field_values where field_id = old.id)
     or exists (select 1 from public.block_spec_references where field_id = old.id) then
    raise exception 'Field % is referenced by overrides, releases, or document blocks; archive instead of deleting', old.id;
  end if;
  return old;
end;
$$;

-- --- Row-Level Security -------------------------------------------------------
-- Pattern: members read, editors (owner/admin/member — not viewers) write.
alter table public.documents                   enable row level security;
alter table public.document_revisions          enable row level security;
alter table public.blocks                       enable row level security;
alter table public.block_spec_references        enable row level security;
alter table public.block_brief_references       enable row level security;
alter table public.placeholder_brief_references enable row level security;
alter table public.generation_runs             enable row level security;
alter table public.generation_run_sections     enable row level security;

create policy documents_read on public.documents for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy documents_write on public.documents for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy revisions_read on public.document_revisions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy revisions_write on public.document_revisions for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy blocks_read on public.blocks for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy blocks_write on public.blocks for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy bsr_read on public.block_spec_references for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy bsr_write on public.block_spec_references for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy bbr_read on public.block_brief_references for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy bbr_write on public.block_brief_references for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy pbr_read on public.placeholder_brief_references for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy pbr_write on public.placeholder_brief_references for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));

-- Generation runs: members read (the editor UI + Realtime subscribe here).
-- Writes come from the generation pipeline (service role) ONLY — no
-- authenticated insert/update policy, so runs cannot be forged from a client.
create policy generation_runs_read on public.generation_runs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy grs_read on public.generation_run_sections for select to authenticated
  using (private.is_workspace_member(workspace_id));
