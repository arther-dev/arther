-- ============================================================================
-- Arther — Migration 0017: Document Type fork + archive-when-referenced (G0.1)
--
-- 1) fork_document_type(): atomically copies a built-in (or any readable)
--    Document Type into a workspace as an editable copy — the type row, its
--    ordered sections, and its approval-role definitions, in one transaction
--    (impossible atomically over PostgREST from the client). SECURITY INVOKER
--    like 0012/0013: the caller's RLS governs every read and write — the source
--    is readable only if built-in (workspace_id null) or in the caller's
--    workspace, and the copies land only if the caller is owner/admin of the
--    target workspace (the 0004 admin-write policy). forked_from links the copy
--    back to its source (generator spec §3.4).
-- 2) guard_document_type_hard_delete(): a Document Type with documents or
--    published snapshots generated from it cannot be hard-deleted — archive it
--    instead (invariant 7, generator spec §3.8: "Archived Document Types block
--    new document creation but do not affect existing documents"). The 0005
--    documents.document_type_id FK already restricts the delete; this guard
--    turns that into the friendly, intentional message and keeps document_types
--    consistent with the archive-over-delete guards on the rest of the graph.
--
-- Depends on: 0004 (document_types + sections + approval roles), 0005
-- (documents / published_snapshots referencing document_type_id).
-- ============================================================================

-- --- 1) Atomic fork -------------------------------------------------------------
create or replace function public.fork_document_type(
  p_document_type_id uuid,
  p_workspace_id     uuid,
  p_name             text default null
)
returns uuid
language plpgsql
-- security invoker (default): the caller's RLS governs the source read and every
-- insert below — forking into a workspace requires owner/admin there (0004).
set search_path = public
as $$
declare
  v_source   public.document_types%rowtype;
  v_new_id   uuid;
begin
  select * into v_source from public.document_types where id = p_document_type_id;
  if not found then
    raise exception 'document type % not found or not accessible', p_document_type_id;
  end if;
  if p_workspace_id is null then
    raise exception 'a target workspace is required to fork a document type';
  end if;

  insert into public.document_types
    (workspace_id, name, description, built_in, forked_from,
     default_brand_profile_id, quality_standard_id, created_by, updated_by)
  values
    (p_workspace_id,
     coalesce(nullif(trim(p_name), ''), v_source.name),
     v_source.description,
     false,
     v_source.id,
     -- Brand/quality links are workspace-scoped; a built-in source carries none,
     -- so these are null on a fork from a built-in and get set in Settings.
     case when v_source.workspace_id = p_workspace_id then v_source.default_brand_profile_id end,
     case when v_source.workspace_id = p_workspace_id then v_source.quality_standard_id end,
     auth.uid(), auth.uid())
  returning id into v_new_id;

  insert into public.document_type_sections
    (workspace_id, document_type_id, name, display_order, spec_field_categories,
     brief_fragment_keys, brief_required, default_block_types, quality_overrides,
     created_by, updated_by)
  select p_workspace_id, v_new_id, s.name, s.display_order, s.spec_field_categories,
         s.brief_fragment_keys, s.brief_required, s.default_block_types, s.quality_overrides,
         auth.uid(), auth.uid()
    from public.document_type_sections s
   where s.document_type_id = p_document_type_id;

  insert into public.document_type_approval_roles
    (workspace_id, document_type_id, role_label, required, display_order, created_by, updated_by)
  select p_workspace_id, v_new_id, r.role_label, r.required, r.display_order, auth.uid(), auth.uid()
    from public.document_type_approval_roles r
   where r.document_type_id = p_document_type_id;

  return v_new_id;
end;
$$;

-- --- 2) Archive-when-referenced: block hard delete while documents exist --------
create or replace function public.guard_document_type_hard_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.documents where document_type_id = old.id)
     or exists (select 1 from public.published_snapshots where document_type_id = old.id) then
    raise exception
      'Document Type % has documents generated from it; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;
create trigger document_types_guard_delete before delete on public.document_types
  for each row execute function public.guard_document_type_hard_delete();
