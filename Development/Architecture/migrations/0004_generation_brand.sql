-- ============================================================================
-- Arther — Migration 0004: Generation, Brand & Briefs
-- Document Types (generation schemas) + sections + approval roles, Brand
-- Profiles, Quality Standards, and graph-mirrored Product Briefs.
-- Depends on: 0001, 0002, 0003.
-- ============================================================================

-- --- Brand Profiles -----------------------------------------------------------
create table public.brand_profiles (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  name                text not null,
  is_workspace_default boolean not null default false,
  logo_url            text,
  primary_colour      text,
  typography          jsonb not null default '{}'::jsonb,   -- { heading_font, body_font }
  voice_descriptors   jsonb not null default '[]'::jsonb,   -- ['precise','confident']
  tone_notes          text,
  glossary            jsonb not null default '{}'::jsonb,   -- { preferred_terms, prohibited_terms }
  unit_preference     text not null default 'metric' check (unit_preference in ('metric','imperial','both')),
  archived_at         timestamptz,
  archived_by         uuid references public.users(id),
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id),
  updated_at          timestamptz not null default now()
);
create index brand_profiles_workspace_idx on public.brand_profiles (workspace_id);
create unique index brand_profiles_one_default_idx
  on public.brand_profiles (workspace_id) where (is_workspace_default and archived_at is null);
create trigger brand_profiles_set_updated_at before update on public.brand_profiles
  for each row execute function public.set_updated_at();

-- --- Document Quality Standards (separate from Brand) --------------------------
create table public.document_quality_standards (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  constraints  jsonb not null default '[]'::jsonb,   -- QualityConstraint[]
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now()
);
create index dqs_workspace_idx on public.document_quality_standards (workspace_id);
create trigger dqs_set_updated_at before update on public.document_quality_standards
  for each row execute function public.set_updated_at();

-- --- Document Types (the generation schema) -----------------------------------
-- workspace_id null = built-in (forkable, not editable). forked_from links a
-- workspace copy back to its built-in source.
create table public.document_types (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid references public.workspaces(id) on delete cascade,  -- null = built-in
  name                     text not null,
  description              text,
  built_in                 boolean not null default false,
  forked_from              uuid references public.document_types(id),
  default_brand_profile_id uuid references public.brand_profiles(id),
  quality_standard_id      uuid references public.document_quality_standards(id),
  archived_at              timestamptz,
  created_by               uuid references public.users(id),
  created_at               timestamptz not null default now(),
  updated_by               uuid references public.users(id),
  updated_at               timestamptz not null default now()
);
create index document_types_workspace_idx on public.document_types (workspace_id);
create trigger document_types_set_updated_at before update on public.document_types
  for each row execute function public.set_updated_at();

create table public.document_type_sections (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspaces(id) on delete cascade,  -- mirrors parent; null for built-in
  document_type_id uuid not null references public.document_types(id) on delete cascade,
  name             text not null,
  display_order    integer not null default 0,
  spec_field_categories jsonb not null default '[]'::jsonb,   -- which categories feed this section
  brief_fragment_keys   jsonb not null default '[]'::jsonb,   -- which brief keys feed this section
  brief_required   boolean not null default false,
  default_block_types   jsonb not null default '[]'::jsonb,
  quality_overrides     jsonb not null default '[]'::jsonb,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id),
  updated_at       timestamptz not null default now()
);
create index dts_type_idx on public.document_type_sections (document_type_id, display_order);
create trigger dts_set_updated_at before update on public.document_type_sections
  for each row execute function public.set_updated_at();

create table public.document_type_approval_roles (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspaces(id) on delete cascade,  -- mirrors parent
  document_type_id uuid not null references public.document_types(id) on delete cascade,
  role_label       text not null,
  required         boolean not null default true,
  display_order    integer not null default 0,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id),
  updated_at       timestamptz not null default now()
);
create index dtar_type_idx on public.document_type_approval_roles (document_type_id);
create trigger dtar_set_updated_at before update on public.document_type_approval_roles
  for each row execute function public.set_updated_at();

create table public.approval_role_assignments (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  role_id             uuid not null references public.document_type_approval_roles(id) on delete cascade,
  workspace_member_id uuid not null references public.workspace_members(id) on delete cascade,
  assigned_by         uuid references public.users(id),
  assigned_at         timestamptz not null default now(),
  unique (role_id, workspace_member_id)
);
create index ara_role_idx on public.approval_role_assignments (role_id);

-- --- Product Briefs (mirror the graph: attached to a product OR component) -----
create table public.product_briefs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type  text not null check (entity_type in ('product','component')),
  entity_id    uuid not null,                              -- products(id) or components(id)
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index product_briefs_workspace_idx on public.product_briefs (workspace_id);
create trigger product_briefs_set_updated_at before update on public.product_briefs
  for each row execute function public.set_updated_at();

create table public.brief_fragments (
  id         uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brief_id   uuid not null references public.product_briefs(id) on delete cascade,
  key        text not null,                                -- 'overview', 'target_applications', ...
  content    text not null default '',
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (brief_id, key)
);
create index brief_fragments_brief_idx on public.brief_fragments (brief_id);
create trigger brief_fragments_set_updated_at before update on public.brief_fragments
  for each row execute function public.set_updated_at();

-- --- Row-Level Security -------------------------------------------------------
alter table public.brand_profiles               enable row level security;
alter table public.document_quality_standards   enable row level security;
alter table public.document_types               enable row level security;
alter table public.document_type_sections       enable row level security;
alter table public.document_type_approval_roles enable row level security;
alter table public.approval_role_assignments    enable row level security;
alter table public.product_briefs               enable row level security;
alter table public.brief_fragments              enable row level security;

-- Settings surfaces (Brand Profiles, Quality Standards, approval-role assignment
-- are admin-managed per the Workspace Admin spec): members read, admins write.
create policy brand_profiles_read on public.brand_profiles for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy brand_profiles_write on public.brand_profiles for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));
create policy dqs_read on public.document_quality_standards for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy dqs_write on public.document_quality_standards for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));
create policy ara_read on public.approval_role_assignments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy ara_write on public.approval_role_assignments for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));

-- Briefs are authoring content: members read, editors write.
create policy product_briefs_read on public.product_briefs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy product_briefs_write on public.product_briefs for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy brief_fragments_read on public.brief_fragments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy brief_fragments_write on public.brief_fragments for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));

-- Built-in-or-admin tables (workspace_id null = global built-in, readable by all;
-- Document Types are a Settings surface — admins write).
create policy document_types_read on public.document_types for select to authenticated
  using (workspace_id is null or private.is_workspace_member(workspace_id));
create policy document_types_write on public.document_types for all to authenticated
  using (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']));

create policy dts_read on public.document_type_sections for select to authenticated
  using (workspace_id is null or private.is_workspace_member(workspace_id));
create policy dts_write on public.document_type_sections for all to authenticated
  using (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']));

create policy dtar_read on public.document_type_approval_roles for select to authenticated
  using (workspace_id is null or private.is_workspace_member(workspace_id));
create policy dtar_write on public.document_type_approval_roles for all to authenticated
  using (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (workspace_id is not null and private.has_workspace_role(workspace_id, array['owner','admin']));

-- --- Seed: the five built-in Document Types (forkable, not editable) -----------
-- All five built-ins from the PRD / generator spec: Datasheet, Installation
-- Manual, User Guide, Quick Start, Declaration of Conformity. Section schemas
-- are starting scaffolds validated with early customers per the generator spec.
-- Built-ins are global (workspace_id null).
with t as (
  insert into public.document_types (workspace_id, name, description, built_in)
  values
    (null, 'Datasheet',                 'Concise product specification document', true),
    (null, 'Installation Manual',       'Step-by-step installation and setup guide', true),
    (null, 'User Guide',                'Operation and usage instructions', true),
    (null, 'Quick Start',               'Get-running-in-minutes condensed guide', true),
    (null, 'Declaration of Conformity', 'Formal declaration of regulatory compliance', true)
  returning id, name
)
insert into public.document_type_sections
  (workspace_id, document_type_id, name, display_order, spec_field_categories, brief_fragment_keys, brief_required, default_block_types)
select null, t.id, s.name, s.ord, s.cats::jsonb, s.keys::jsonb, s.breq, s.blocks::jsonb
from t
join (
  values
    -- Datasheet
    ('Datasheet','Overview',                 1, '[]',                          '["overview"]',            true,  '["section_header","paragraph"]'),
    ('Datasheet','Electrical Characteristics',2, '["Electrical"]',             '[]',                      false, '["section_header","spec_table"]'),
    ('Datasheet','Mechanical Specifications', 3, '["Mechanical"]',             '[]',                      false, '["section_header","spec_table"]'),
    ('Datasheet','Performance',              4, '["Performance"]',            '[]',                      false, '["section_header","spec_table","chart"]'),
    ('Datasheet','Compliance',               5, '["Compliance"]',             '["compliance_context"]',  false, '["section_header","spec_table","note"]'),
    -- Installation Manual
    ('Installation Manual','Overview',       1, '[]',                          '["overview"]',            true,  '["section_header","paragraph"]'),
    ('Installation Manual','Safety',         2, '["Compliance"]',             '["safety_context"]',      true,  '["section_header","warning","caution"]'),
    ('Installation Manual','Installation',   3, '[]',                          '["installation_context"]',true,  '["section_header","step_wizard","note"]'),
    ('Installation Manual','Specifications', 4, '["Electrical","Mechanical"]', '[]',                      false, '["section_header","spec_table"]'),
    -- User Guide
    ('User Guide','Overview',                1, '[]',                          '["overview"]',            true,  '["section_header","paragraph"]'),
    ('User Guide','Operation',               2, '[]',                          '["operation_context"]',   true,  '["section_header","step_wizard","accordion"]'),
    ('User Guide','Maintenance',             3, '[]',                          '["maintenance_context"]', false, '["section_header","paragraph","note"]'),
    -- Quick Start
    ('Quick Start','Overview',               1, '[]',                          '["overview"]',            true,  '["section_header","paragraph"]'),
    ('Quick Start','What''s in the Box',     2, '[]',                          '["package_contents"]',    false, '["section_header","paragraph"]'),
    ('Quick Start','Setup',                  3, '[]',                          '["installation_context"]',true,  '["section_header","step_wizard"]'),
    ('Quick Start','Key Specifications',     4, '["Electrical","Mechanical"]', '[]',                      false, '["section_header","spec_table"]'),
    -- Declaration of Conformity
    ('Declaration of Conformity','Identification',     1, '[]',               '["overview"]',             true,  '["section_header","paragraph"]'),
    ('Declaration of Conformity','Applicable Directives & Standards', 2, '["Compliance"]', '["compliance_context"]', true, '["section_header","spec_table","paragraph"]'),
    ('Declaration of Conformity','Declaration',        3, '["Compliance"]',   '["declaration_context"]',  true,  '["section_header","paragraph","note"]')
) as s(type_name, name, ord, cats, keys, breq, blocks)
on t.name = s.type_name;
