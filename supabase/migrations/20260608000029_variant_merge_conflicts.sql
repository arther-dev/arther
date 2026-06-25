-- ============================================================================
-- Arther — Migration 0029: Variant merge conflicts (V.6)
-- Persists the conflicts the V.5 variant merge cannot auto-resolve: unlinked prose
-- that DIFFERS across variants (no spec field to anchor the merge). Two paths
-- (Product Variants §4.8):
--   • AI-generated (the block was never manually edited) → a NON-blocking review
--     item (blocking=false); each variant's version is kept (MANUAL-scoped) and the
--     author resolves at their own pace.
--   • Human-edited → BLOCKING; publication is refused until the conflict is resolved.
-- The merged document's block_variant_scopes already hold the per-variant blocks;
-- this table is the review/resolution ledger over them. Depends on: 0001-0028.
-- ============================================================================

create table public.block_merge_conflicts (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  document_id       uuid not null references public.documents(id) on delete cascade,
  generation_run_id uuid references public.generation_runs(id) on delete set null,
  section_name      text not null default '',
  position          integer not null default 0,
  -- The conflicting per-variant block versions: [{ "variant_id": uuid, "block_id": uuid }, …].
  versions          jsonb not null default '[]'::jsonb,
  status            text not null default 'open' check (status in ('open', 'resolved')),
  -- Path B (a manually-edited block) blocks publish; Path A (fresh AI prose) doesn't.
  blocking          boolean not null default false,
  resolution        text check (resolution in ('keep_both', 'use_variant', 'shared', 'regenerated')),
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  resolved_by       uuid references public.users(id),
  resolved_at       timestamptz,
  updated_by        uuid references public.users(id),
  updated_at        timestamptz not null default now(),
  -- A resolved conflict always records HOW it was resolved (attribution discipline).
  constraint block_merge_conflicts_resolution_set check (status = 'open' or resolution is not null)
);
create index block_merge_conflicts_document_idx on public.block_merge_conflicts (document_id);
create index block_merge_conflicts_workspace_idx on public.block_merge_conflicts (workspace_id);
-- The hot path: open conflicts for a document (the review list + the publish gate).
create index block_merge_conflicts_open_idx
  on public.block_merge_conflicts (document_id) where (status = 'open');
create trigger block_merge_conflicts_set_updated_at before update on public.block_merge_conflicts
  for each row execute function public.set_updated_at();

-- --- Row-Level Security -------------------------------------------------------
-- Members read; editors write (resolve). System rows are inserted by the variant
-- generation task under the service role (BYPASSRLS); resolution is an authenticated
-- editor action. Viewers are excluded, like every other authoring table.
alter table public.block_merge_conflicts enable row level security;
create policy block_merge_conflicts_read on public.block_merge_conflicts for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy block_merge_conflicts_write on public.block_merge_conflicts for all to authenticated
  using (private.is_workspace_editor(workspace_id)) with check (private.is_workspace_editor(workspace_id));
