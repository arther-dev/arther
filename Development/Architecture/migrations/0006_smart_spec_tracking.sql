-- ============================================================================
-- Arther — Migration 0006: Smart Spec Tracking
-- Review state per document, field-change diffs, the four review-item types,
-- the action dashboard, and the domain-ownership matrix.
-- Surfaces via the dashboard this phase; email/in-app notification *delivery*
-- arrives with Collaboration (Phase 3).
-- Depends on: 0001-0005.
-- ============================================================================

-- --- Per-document review state ------------------------------------------------
create table public.document_review_states (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  document_id           uuid not null references public.documents(id) on delete cascade,
  state                 text not null default 'current' check (state in ('current','needs_review')),
  triggered_at          timestamptz,
  triggered_by_field_ids jsonb not null default '[]'::jsonb,
  last_published_at     timestamptz,
  last_published_by     uuid references public.users(id),
  unique (document_id)
);
create index drs_workspace_state_idx on public.document_review_states (workspace_id, state);

-- --- Field change diffs (a value change that may trigger review items) ---------
create table public.field_change_diffs (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  field_id          uuid not null references public.spec_fields(id) on delete cascade,
  field_name        text,
  component_id      uuid references public.components(id) on delete set null,
  component_name    text,
  old_version_id    uuid references public.field_versions(id) on delete set null,
  new_version_id    uuid references public.field_versions(id) on delete set null,
  old_display_value text,
  new_display_value text,
  changed_by        uuid references public.users(id),
  changed_at        timestamptz not null default now()
);
create index fcd_field_idx on public.field_change_diffs (field_id, changed_at desc);

-- --- Review item: prose section needing human review (two-speed: prose path) ---
create table public.section_review_items (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  document_id       uuid not null references public.documents(id) on delete cascade,
  section_name      text not null,
  field_category    text,
  assigned_to       uuid references public.users(id),          -- resolved domain owner
  field_change_diffs jsonb not null default '[]'::jsonb,       -- FieldChangeDiff ids
  affected_block_ids jsonb not null default '[]'::jsonb,
  status            text not null default 'pending'
                     check (status in ('pending','approved','changes_requested')),
  notes             text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid references public.users(id)
);
create index sri_assignee_idx on public.section_review_items (assigned_to, status);
create index sri_document_idx on public.section_review_items (document_id);

-- --- Review item: scalar override possibly invalidated by a component change ---
create table public.scalar_override_review_items (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  product_id          uuid not null references public.products(id) on delete cascade,
  component_id        uuid references public.components(id) on delete set null,
  field_id            uuid not null references public.spec_fields(id) on delete cascade,
  field_name          text,
  override_value      jsonb,
  field_change_diff_id uuid references public.field_change_diffs(id) on delete set null,
  assigned_to         uuid references public.users(id),        -- ScalarOverride.set_by
  status              text not null default 'pending'
                       check (status in ('pending','confirmed','updated','removed')),
  resolution_notes    text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid references public.users(id)
);
create index sori_assignee_idx on public.scalar_override_review_items (assigned_to, status);

-- --- Review item: snippet prose needing review after a spec token update -------
-- snippet_id references library_items (created in the Content Reuse phase) -> uuid for now.
create table public.snippet_review_items (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  snippet_id           uuid not null,
  snippet_name         text,
  field_change_diffs   jsonb not null default '[]'::jsonb,
  affected_block_ids   jsonb not null default '[]'::jsonb,
  assigned_to          uuid references public.users(id),       -- snippet owner
  embedding_document_ids jsonb not null default '[]'::jsonb,
  status               text not null default 'pending'
                        check (status in ('pending','approved','changes_requested')),
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  resolved_by          uuid references public.users(id)
);
create index snri_assignee_idx on public.snippet_review_items (assigned_to, status);

-- --- Flag: a chart whose table-field data source lost a column -----------------
create table public.chart_configuration_flags (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  block_id         uuid not null references public.blocks(id) on delete cascade,
  document_id      uuid not null references public.documents(id) on delete cascade,
  field_id         uuid not null references public.spec_fields(id) on delete cascade,
  missing_column_id text,
  detected_at      timestamptz not null default now(),
  resolved_at      timestamptz
);
create index ccf_document_idx on public.chart_configuration_flags (document_id);

-- --- The action dashboard (aggregates all item types per assignee) -------------
create table public.dashboard_action_items (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type         text not null check (type in (
                 'section_review','document_approval','override_review',
                 'snippet_review','placeholder_brief','comment_mention','review_requested')),
  assigned_to  uuid not null references public.users(id),
  reference_id uuid not null,                              -- the underlying item id
  title        text not null,
  context      text,
  document_id  uuid references public.documents(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','resolved')),
  created_at   timestamptz not null default now()
);
create index dai_assignee_idx on public.dashboard_action_items (assigned_to, status, created_at desc);
create index dai_workspace_idx on public.dashboard_action_items (workspace_id, status);

-- --- Domain ownership matrix (4-step fallback resolves in app) -----------------
create table public.domain_ownership_config (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  field_category text not null,
  product_id    uuid references public.products(id) on delete cascade,  -- null = workspace default
  owner_user_id uuid not null references public.users(id),
  set_by        uuid references public.users(id),
  set_at        timestamptz not null default now()
);
-- One owner per (category) at workspace-default scope, and per (category, product) at product scope.
create unique index doc_default_idx on public.domain_ownership_config (workspace_id, field_category)
  where (product_id is null);
create unique index doc_product_idx on public.domain_ownership_config (workspace_id, field_category, product_id)
  where (product_id is not null);

-- --- Row-Level Security -------------------------------------------------------
alter table public.document_review_states      enable row level security;
alter table public.field_change_diffs          enable row level security;
alter table public.section_review_items        enable row level security;
alter table public.scalar_override_review_items enable row level security;
alter table public.snippet_review_items        enable row level security;
alter table public.chart_configuration_flags   enable row level security;
alter table public.dashboard_action_items      enable row level security;
alter table public.domain_ownership_config     enable row level security;

-- Derived tracking state (review states, change diffs) is written by the
-- propagation task (service role) ONLY — members read; no authenticated writes.
create policy drs_read on public.document_review_states for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy fcd_read on public.field_change_diffs for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Review items / flags / dashboard: members read; editors resolve (write).
create policy sri_read on public.section_review_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy sri_write on public.section_review_items for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy sori_read on public.scalar_override_review_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy sori_write on public.scalar_override_review_items for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy snri_read on public.snippet_review_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy snri_write on public.snippet_review_items for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy ccf_read on public.chart_configuration_flags for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy ccf_write on public.chart_configuration_flags for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
create policy dai_read on public.dashboard_action_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy dai_write on public.dashboard_action_items for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));

-- Domain ownership is a Settings surface (admin-managed matrix).
create policy doc_read on public.domain_ownership_config for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy doc_write on public.domain_ownership_config for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner','admin']))
  with check (private.has_workspace_role(workspace_id, array['owner','admin']));
