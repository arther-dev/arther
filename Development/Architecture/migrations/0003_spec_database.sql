-- ============================================================================
-- Arther — Migration 0003: Spec Database
-- The system of record: units, categories, products, components, the graph
-- edges, typed spec fields, immutable field versions, overrides, releases,
-- field comments, templates. Plus RLS, archive guards, seeds, and the
-- create_workspace / seed_workspace_defaults RPCs.
-- Depends on: 0001, 0002.
-- ============================================================================

-- --- Unit registry ------------------------------------------------------------
-- Built-in units are global (workspace_id null). Custom units are per-workspace.
create table public.units (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  symbol       text not null,
  dimension    text not null,
  si_factor    numeric not null default 1,         -- factor to SI base (offset units handled in app)
  custom       boolean not null default false,
  workspace_id uuid references public.workspaces(id) on delete cascade,  -- null = built-in
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now()
);
create index units_workspace_idx on public.units (workspace_id);
create trigger units_set_updated_at before update on public.units
  for each row execute function public.set_updated_at();

-- --- Field categories (workspace-defined list; built-ins seeded per workspace) -
create table public.spec_categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  built_in      boolean not null default false,
  hidden        boolean not null default false,
  display_order integer not null default 0,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references public.users(id),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);
create trigger spec_categories_set_updated_at before update on public.spec_categories
  for each row execute function public.set_updated_at();

-- --- Products & components (independent entities; graph, not tree) -------------
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  description  text,
  archived_at  timestamptz,
  archived_by  uuid references public.users(id),
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now()
);
create index products_workspace_idx on public.products (workspace_id);
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.components (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  name             text not null,
  type             text not null default 'part',     -- assembly | module | part
  default_category text,
  description      text,
  archived_at      timestamptz,
  archived_by      uuid references public.users(id),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id),
  updated_at       timestamptz not null default now()
);
create index components_workspace_idx on public.components (workspace_id);
create trigger components_set_updated_at before update on public.components
  for each row execute function public.set_updated_at();

-- Graph edges. A component used by N products has N edges and ONE field history.
-- parent_component_id nests WITHIN a product's tree (references another edge).
create table public.product_components (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  product_id          uuid not null references public.products(id)   on delete cascade,
  component_id        uuid not null references public.components(id) on delete restrict,
  parent_component_id uuid references public.product_components(id)  on delete set null,
  quantity            integer not null default 1 check (quantity > 0),
  display_order       integer not null default 0,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id),
  updated_at          timestamptz not null default now()
);
create trigger product_components_set_updated_at before update on public.product_components
  for each row execute function public.set_updated_at();
create index product_components_product_idx on public.product_components (product_id, parent_component_id);
create index product_components_component_idx on public.product_components (component_id);

-- --- Spec fields (8 types) ----------------------------------------------------
-- Owned by exactly one of component / product (CHECK enforces the XOR).
-- `value` is the typed FieldValue union as JSONB, validated by Zod in the app.
create table public.spec_fields (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  component_id       uuid references public.components(id) on delete cascade,
  product_id         uuid references public.products(id)   on delete cascade,
  name               text not null,
  type               text not null check (type in
                       ('scalar','range','toleranced','boolean','enum','multi_enum','table','reference')),
  value              jsonb,                                  -- null = "not yet entered"
  unit_id            uuid references public.units(id),
  conditions         text,
  source             text not null default 'rated'
                       check (source in ('rated','typical','measured','calculated')),
  formula            text,
  depends_on         jsonb not null default '[]'::jsonb,     -- field id array
  options            jsonb,                                  -- enum / multi_enum options
  category           text not null,
  required           boolean not null default false,
  internal_only      boolean not null default false,
  display_order      integer not null default 0,
  current_version_id uuid,                                   -- FK added below (circular)
  provenance         text not null default 'manual' check (provenance in ('manual','sync')),
  sync_source_id     text,
  last_synced_at     timestamptz,
  archived_at        timestamptz,
  archived_by        uuid references public.users(id),
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references public.users(id),
  updated_at         timestamptz not null default now(),
  constraint spec_fields_one_owner check (num_nonnulls(component_id, product_id) = 1)
);
create index spec_fields_component_idx on public.spec_fields (component_id);
create index spec_fields_product_idx   on public.spec_fields (product_id);
create index spec_fields_workspace_idx on public.spec_fields (workspace_id);
create index spec_fields_current_version_idx on public.spec_fields (current_version_id);
create index spec_fields_name_trgm_idx on public.spec_fields using gin (name gin_trgm_ops);
create trigger spec_fields_set_updated_at before update on public.spec_fields
  for each row execute function public.set_updated_at();

-- --- Field version history (append-only; powers staleness) --------------------
create table public.field_versions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  field_id     uuid not null references public.spec_fields(id) on delete cascade,
  value        jsonb,
  diff         jsonb,                                  -- structured; row-level for tables
  changed_by   uuid references public.users(id),
  changed_at   timestamptz not null default now(),
  note         text
);
create index field_versions_field_time_idx on public.field_versions (field_id, changed_at desc);
-- Immutable to users: no UPDATE/DELETE policy below + this guard against edits.
-- (DELETE is allowed only via cascade when a field is hard-deleted, which runs
--  as table owner and bypasses RLS; users can never delete versions directly.)
create trigger field_versions_no_update before update on public.field_versions
  for each row execute function public.prevent_mutation();

-- Now wire the circular pointer: spec_fields.current_version_id -> field_versions.id
alter table public.spec_fields
  add constraint spec_fields_current_version_fk
  foreign key (current_version_id) references public.field_versions(id) on delete set null;

-- --- Product-specific scalar overrides (on the edge, not the component) --------
create table public.product_component_overrides (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  product_component_id uuid not null references public.product_components(id) on delete cascade,
  field_id             uuid not null references public.spec_fields(id) on delete restrict,
  value                jsonb not null,
  set_by               uuid references public.users(id),
  set_at               timestamptz not null default now(),
  unique (product_component_id, field_id)
);
create index pc_overrides_field_idx on public.product_component_overrides (field_id);

-- --- Field comments (field-attached with version context markers) --------------
create table public.field_comments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  field_id          uuid not null references public.spec_fields(id) on delete cascade,
  field_version_id  uuid references public.field_versions(id) on delete set null,
  value_snapshot    jsonb,
  author_id         uuid references public.users(id),
  body              text not null,
  parent_comment_id uuid references public.field_comments(id) on delete cascade,
  created_at        timestamptz not null default now(),
  edited_at         timestamptz
);
create index field_comments_field_idx on public.field_comments (field_id);

-- --- Releases (named immutable snapshots) -------------------------------------
create table public.product_releases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  name         text not null,
  tag          text not null,
  notes        text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);
create index product_releases_product_idx on public.product_releases (product_id);

create table public.release_field_values (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  release_id   uuid not null references public.product_releases(id) on delete cascade,
  field_id     uuid not null references public.spec_fields(id) on delete restrict,
  version_id   uuid not null references public.field_versions(id) on delete restrict,
  primary key (release_id, field_id)
);

-- Releases are IMMUTABLE snapshots (spec DB spec): the pinned values may never
-- change, and release metadata is frozen except `notes`. Users get no DELETE
-- policy below; rows go away only via owner-context cascade (product hard delete,
-- which guard_product_hard_delete blocks while releases exist — see below).
create or replace function public.guard_release_frozen()
returns trigger language plpgsql as $$
begin
  if new.name       is distinct from old.name
     or new.tag        is distinct from old.tag
     or new.product_id is distinct from old.product_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Product releases are immutable snapshots; only notes may be edited';
  end if;
  return new;
end;
$$;
create trigger product_releases_freeze before update on public.product_releases
  for each row execute function public.guard_release_frozen();
create trigger release_field_values_no_update before update on public.release_field_values
  for each row execute function public.prevent_mutation();

-- --- Templates (scaffolds; built-in forkable + workspace-owned) ----------------
create table public.spec_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,  -- null = built-in
  name         text not null,
  category     text not null,
  built_in     boolean not null default false,
  forked_from  uuid references public.spec_templates(id),
  structure    jsonb not null default '{}'::jsonb,    -- components + fields scaffold
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now()
);
create trigger spec_templates_set_updated_at before update on public.spec_templates
  for each row execute function public.set_updated_at();

-- --- Archive guards (hard delete only at zero references; invariant 7) ---------
create or replace function public.guard_component_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.product_components where component_id = old.id) then
    raise exception 'Component % is used by products; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;
create trigger components_guard_delete before delete on public.components
  for each row execute function public.guard_component_hard_delete();

create or replace function public.guard_field_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.product_component_overrides where field_id = old.id)
     or exists (select 1 from public.release_field_values where field_id = old.id) then
    raise exception 'Field % is referenced by overrides or releases; archive instead of deleting', old.id;
  end if;
  return old;
end;
$$;
create trigger spec_fields_guard_delete before delete on public.spec_fields
  for each row execute function public.guard_field_hard_delete();

-- Products are archive-only while they have history: documents and published
-- snapshots already block via FK `restrict`; releases would otherwise CASCADE
-- away silently — destroying pinned field history. Block that here.
-- (Extended in 0010 to also block while variants exist.)
create or replace function public.guard_product_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.product_releases where product_id = old.id) then
    raise exception 'Product % has releases; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;
create trigger products_guard_delete before delete on public.products
  for each row execute function public.guard_product_hard_delete();
-- NOTE: extend guard_field_hard_delete / guard_component_hard_delete in the
-- documents migration to also block on block_spec_references (Phase 2).

-- --- Row-Level Security (tenant isolation on every table) ----------------------
alter table public.units                       enable row level security;
alter table public.spec_categories             enable row level security;
alter table public.products                     enable row level security;
alter table public.components                   enable row level security;
alter table public.product_components           enable row level security;
alter table public.spec_fields                  enable row level security;
alter table public.field_versions               enable row level security;
alter table public.product_component_overrides  enable row level security;
alter table public.field_comments               enable row level security;
alter table public.product_releases             enable row level security;
alter table public.release_field_values         enable row level security;
alter table public.spec_templates               enable row level security;

-- POLICY PATTERN (defence in depth behind canDo):
--   read  = any workspace member (viewers included)
--   write = owner/admin/member via private.is_workspace_editor — VIEWERS CANNOT
--           WRITE CONTENT at the row, mirroring the Editor/Viewer seat boundary.
--   admin = owner/admin only, for Settings-surface tables.

-- units: global built-ins readable by all; custom units are a Settings surface (admin).
create policy units_read on public.units for select to authenticated
  using (workspace_id is null or private.is_workspace_member(workspace_id));
create policy units_write on public.units for all to authenticated
  using (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']));

-- templates: global built-ins readable by all; workspace templates writable by editors.
create policy templates_read on public.spec_templates for select to authenticated
  using (workspace_id is null or private.is_workspace_member(workspace_id));
create policy templates_write on public.spec_templates for all to authenticated
  using (workspace_id is not null and private.is_workspace_editor(workspace_id))
  with check (workspace_id is not null and private.is_workspace_editor(workspace_id));

-- categories: a Settings surface (admin-managed list).
create policy categories_read on public.spec_categories for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy categories_write on public.spec_categories for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));

-- Spec content: members read; editors write.
create policy products_read on public.products for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy products_write on public.products for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy components_read on public.components for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy components_write on public.components for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy product_components_read on public.product_components for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy product_components_write on public.product_components for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy spec_fields_read on public.spec_fields for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy spec_fields_write on public.spec_fields for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy overrides_read on public.product_component_overrides for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy overrides_write on public.product_component_overrides for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));

-- Field comments: ALL members including viewers (commenting is a viewer right
-- per the billing/collaboration specs) — deliberately not editor-gated.
create policy field_comments_rw on public.field_comments for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- Releases: members read; editors create; updates pass the notes-only freeze
-- guard above; NO delete policy (immutable snapshots — see guard_release_frozen).
create policy releases_read on public.product_releases for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy releases_insert on public.product_releases for insert to authenticated
  with check (private.is_workspace_editor(workspace_id));
create policy releases_update on public.product_releases for update to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy release_values_read on public.release_field_values for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy release_values_insert on public.release_field_values for insert to authenticated
  with check (private.is_workspace_editor(workspace_id));

-- field_versions: members read; editors append; never update/delete (immutable).
create policy field_versions_read on public.field_versions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy field_versions_insert on public.field_versions for insert to authenticated
  with check (private.is_workspace_editor(workspace_id));

-- --- Workspace bootstrap RPCs -------------------------------------------------
-- Seed the built-in categories into a workspace (built-in units are global).
create or replace function public.seed_workspace_defaults(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.spec_categories (workspace_id, name, built_in, display_order) values
    (p_workspace_id, 'Electrical',    true, 1),
    (p_workspace_id, 'Mechanical',    true, 2),
    (p_workspace_id, 'Performance',   true, 3),
    (p_workspace_id, 'Thermal',       true, 4),
    (p_workspace_id, 'Environmental', true, 5),
    (p_workspace_id, 'Compliance',    true, 6),
    (p_workspace_id, 'General',       true, 7)
  on conflict (workspace_id, name) do nothing;
end;
$$;

-- Create a workspace + the owner membership + defaults atomically. Runs as
-- definer so the first membership row is insertable before the member exists
-- (resolves the RLS chicken-and-egg). Call this instead of inserting directly.
create or replace function public.create_workspace(p_name text, p_slug citext)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.workspaces (name, slug, owner_id, created_by, updated_by)
    values (p_name, p_slug, v_uid, v_uid, v_uid)
    returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (v_ws, v_uid, 'owner', v_uid);
  perform public.seed_workspace_defaults(v_ws);
  return v_ws;
end;
$$;

-- --- Import sessions (Excel/CSV import via the SpecReconciler) ------------------
-- The import flow is multi-step with a human confirm between diff and apply:
-- upload -> Claude structural interpretation -> proposed mutations (dry run) ->
-- per-row accept/reject -> commit. This table holds that state server-side so a
-- refresh doesn't lose the proposal and the committed decisions are auditable.
-- The (deferred) External Sync webhook path will reuse this same shape.
create table public.import_sessions (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  target_product_id     uuid references public.products(id) on delete set null,
  status                text not null default 'uploaded' check (status in
                          ('uploaded','interpreting','proposed','committing','committed','discarded','failed')),
  source_filename       text,
  file_storage_key      text,                              -- raw upload in Storage (audit trail)
  interpreted_structure jsonb,                              -- SpecReconciler's normalised proposal
  proposed_mutations    jsonb not null default '[]'::jsonb, -- the dry-run diff rows
  decisions             jsonb not null default '{}'::jsonb, -- per-mutation accept/reject
  error                 text,
  trigger_run_id        text,                               -- Trigger.dev run handle
  committed_at          timestamptz,
  created_by            uuid references public.users(id),
  created_at            timestamptz not null default now(),
  updated_by            uuid references public.users(id),
  updated_at            timestamptz not null default now()
);
create index import_sessions_ws_idx on public.import_sessions (workspace_id, status, created_at desc);
create trigger import_sessions_set_updated_at before update on public.import_sessions
  for each row execute function public.set_updated_at();

alter table public.import_sessions enable row level security;
-- Members read; editors create/update (discard = status change). No delete policy:
-- sessions are the import audit trail.
create policy import_sessions_read on public.import_sessions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy import_sessions_insert on public.import_sessions for insert to authenticated
  with check (private.is_workspace_editor(workspace_id));
create policy import_sessions_update on public.import_sessions for update to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));

-- --- Seed: global built-in unit registry (PRD spec §3.6) ----------------------
insert into public.units (name, symbol, dimension, si_factor, custom, workspace_id) values
  ('Volt','V','voltage',1,false,null),
  ('Millivolt','mV','voltage',0.001,false,null),
  ('Kilovolt','kV','voltage',1000,false,null),
  ('Ampere','A','current',1,false,null),
  ('Milliampere','mA','current',0.001,false,null),
  ('Watt','W','power',1,false,null),
  ('Kilowatt','kW','power',1000,false,null),
  ('Ohm','Ω','resistance',1,false,null),
  ('Kiloohm','kΩ','resistance',1000,false,null),
  ('Megaohm','MΩ','resistance',1000000,false,null),
  ('Farad','F','capacitance',1,false,null),
  ('Microfarad','µF','capacitance',0.000001,false,null),
  ('Nanofarad','nF','capacitance',0.000000001,false,null),
  ('Picofarad','pF','capacitance',0.000000000001,false,null),
  ('Henry','H','inductance',1,false,null),
  ('Millihenry','mH','inductance',0.001,false,null),
  ('Hertz','Hz','frequency',1,false,null),
  ('Kilohertz','kHz','frequency',1000,false,null),
  ('Megahertz','MHz','frequency',1000000,false,null),
  ('Newton metre','N·m','torque',1,false,null),
  ('Millinewton metre','mN·m','torque',0.001,false,null),
  ('Revolutions per minute','RPM','angular_velocity',0.104719755,false,null),
  ('Kilogram','kg','mass',1,false,null),
  ('Gram','g','mass',0.001,false,null),
  ('Kilogram square metre','kg·m²','moment_of_inertia',1,false,null),
  ('Millimetre','mm','length',0.001,false,null),
  ('Centimetre','cm','length',0.01,false,null),
  ('Metre','m','length',1,false,null),
  ('Square millimetre','mm²','area',0.000001,false,null),
  ('Square centimetre','cm²','area',0.0001,false,null),
  ('Degree Celsius','°C','temperature',1,false,null),
  ('Kelvin','K','temperature',1,false,null),
  ('Watt per degree Celsius','W/°C','thermal_resistance',1,false,null),
  ('Bar','bar','pressure',100000,false,null),
  ('Pounds per square inch','PSI','pressure',6894.757,false,null),
  ('Litres per minute','L/min','flow',1,false,null),
  ('Millilitres per minute','mL/min','flow',0.001,false,null),
  ('Newton metre per ampere','Nm/A','torque_constant',1,false,null),
  ('Volt per RPM','V/RPM','back_emf',1,false,null),
  ('Percent','%','dimensionless',1,false,null),
  ('Decibel','dB','dimensionless',1,false,null),
  ('Counts per revolution','CPR','dimensionless',1,false,null);
