-- ============================================================================
-- Arther — Migration 0017: Document Type fork (G0.1)
--
-- fork_document_type(): atomically copy a built-in Document Type — the type
-- row, its ordered sections, and its approval roles — into the caller's
-- workspace as an editable copy (built_in = false, forked_from = source).
-- Built-ins stay canonical and read-only (the 0004 write policy already blocks
-- workspace_id IS NULL rows); a workspace customises the fork instead. Same
-- pattern as SpecTemplates, per the AI Document Generator spec §3.4/§7.
--
-- SECURITY INVOKER (default): the caller's RLS governs every write, so the
-- 0004 document_types/sections/approval-roles admin-write policies decide who
-- may fork — a non-admin's inserts are denied at the row (defence in depth
-- behind the app's canDo 'workspace.manage' gate). The source built-in is
-- world-readable (workspace_id null), so the SELECT-INSERT copies see it.
--
-- Depends on: 0004 (document types, sections, approval roles).
-- ============================================================================

create or replace function public.fork_document_type(
  p_type_id      uuid,
  p_workspace_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_src    public.document_types%rowtype;
  v_new_id uuid;
begin
  select * into v_src from public.document_types where id = p_type_id;
  if not found then
    raise exception 'document type % not found or not accessible', p_type_id;
  end if;
  if not v_src.built_in then
    raise exception 'only built-in document types can be forked';
  end if;

  -- The new type belongs to the workspace and points back at its source. Brand
  -- and quality references on built-ins are null (they are global, so they
  -- cannot reference a workspace's profile) and copy across as null.
  insert into public.document_types
    (workspace_id, name, description, built_in, forked_from,
     default_brand_profile_id, quality_standard_id, created_by)
  values
    (p_workspace_id, v_src.name, v_src.description, false, v_src.id,
     v_src.default_brand_profile_id, v_src.quality_standard_id, auth.uid())
  returning id into v_new_id;

  -- Copy the section schema verbatim, preserving order (the data contract).
  insert into public.document_type_sections
    (workspace_id, document_type_id, name, display_order, spec_field_categories,
     brief_fragment_keys, brief_required, default_block_types, quality_overrides, created_by)
  select p_workspace_id, v_new_id, s.name, s.display_order, s.spec_field_categories,
         s.brief_fragment_keys, s.brief_required, s.default_block_types, s.quality_overrides,
         auth.uid()
    from public.document_type_sections s
   where s.document_type_id = p_type_id;

  -- Copy any approval roles (configured in Phase 3; built-ins ship none today).
  insert into public.document_type_approval_roles
    (workspace_id, document_type_id, role_label, required, display_order, created_by)
  select p_workspace_id, v_new_id, r.role_label, r.required, r.display_order, auth.uid()
    from public.document_type_approval_roles r
   where r.document_type_id = p_type_id;

  return v_new_id;
end;
$$;
