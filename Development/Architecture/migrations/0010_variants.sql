-- ============================================================================
-- Arther — Migration 0010: Product Variants
-- Delta-from-base variants, the four delta types, per-block variant scope, and
-- the deferred variant_id foreign keys. Resolved specs are computed at query
-- time and cached in Redis — never materialised here (prevents silent drift).
-- Depends on: 0001-0009.
-- ============================================================================

-- --- Variants (a named set of deltas on a base product) -----------------------
create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,
  is_default  boolean not null default false,            -- base URL redirects here when set
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id),
  updated_at  timestamptz not null default now(),
  unique (product_id, slug)
);
create index product_variants_product_idx on public.product_variants (product_id);
create unique index product_variants_one_default_idx
  on public.product_variants (product_id) where (is_default);
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- --- Variant deltas (applied in created_at order; later wins on conflict) -------
create table public.variant_deltas (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  variant_id               uuid not null references public.product_variants(id) on delete cascade,
  delta_type               text not null check (delta_type in
                            ('SCALAR_OVERRIDE','COMPONENT_SWAP','COMPONENT_REMOVE','COMPONENT_ADD')),
  component_id             uuid references public.components(id) on delete cascade,  -- all types except COMPONENT_ADD
  field_id                 uuid references public.spec_fields(id) on delete cascade, -- SCALAR_OVERRIDE only
  override_value           jsonb,                                                    -- SCALAR_OVERRIDE only
  replacement_component_id uuid references public.components(id) on delete cascade,  -- COMPONENT_SWAP only
  new_component_id         uuid references public.components(id) on delete cascade,  -- COMPONENT_ADD only
  position_after           uuid references public.product_components(id) on delete set null, -- COMPONENT_ADD only
  created_by               uuid references public.users(id),
  created_at               timestamptz not null default now()
);
create index variant_deltas_variant_idx on public.variant_deltas (variant_id, created_at);

-- --- Per-block variant scope (one row per scoped block) ------------------------
create table public.block_variant_scopes (
  block_id            uuid primary key references public.blocks(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  mode                text not null default 'ALL' check (mode in ('ALL','DERIVED','MANUAL')),
  variant_ids         jsonb not null default '[]'::jsonb,    -- MANUAL only
  derived_component_id uuid references public.components(id) on delete set null, -- DERIVED only
  updated_by          uuid references public.users(id),
  updated_at          timestamptz not null default now()
);
create trigger bvs_set_updated_at before update on public.block_variant_scopes
  for each row execute function public.set_updated_at();

-- --- Wire deferred FKs from earlier phases ------------------------------------
alter table public.block_spec_references
  add constraint bsr_variant_fk
  foreign key (variant_id) references public.product_variants(id) on delete cascade;

alter table public.published_snapshots
  add constraint snapshots_variant_fk
  foreign key (variant_id) references public.product_variants(id) on delete set null;

alter table public.generation_runs
  add constraint generation_runs_variant_fk
  foreign key (variant_id) references public.product_variants(id) on delete set null;

-- --- Extend archive guards to cover variants ------------------------------------
-- A component referenced ONLY by a variant delta (e.g. a COMPONENT_ADD target
-- that isn't in any base product) could otherwise be hard-deleted, cascading
-- the delta away and silently changing what the variant means.
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
  if exists (
    select 1 from public.variant_deltas
    where component_id = old.id
       or replacement_component_id = old.id
       or new_component_id = old.id
  ) then
    raise exception 'Component % is referenced by variant deltas; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;

-- Products with variants are archive-only (extends the 0003 guard).
create or replace function public.guard_product_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.product_releases where product_id = old.id) then
    raise exception 'Product % has releases; archive it instead of deleting', old.id;
  end if;
  if exists (select 1 from public.product_variants where product_id = old.id) then
    raise exception 'Product % has variants; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;

-- --- Row-Level Security -------------------------------------------------------
alter table public.product_variants     enable row level security;
alter table public.variant_deltas       enable row level security;
alter table public.block_variant_scopes enable row level security;

-- Members read; editors write (viewers excluded).
create policy product_variants_read on public.product_variants for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy product_variants_write on public.product_variants for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy variant_deltas_read on public.variant_deltas for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy variant_deltas_write on public.variant_deltas for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy block_variant_scopes_read on public.block_variant_scopes for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy block_variant_scopes_write on public.block_variant_scopes for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
