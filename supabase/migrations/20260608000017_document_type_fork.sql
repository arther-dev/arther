-- ============================================================================
-- Arther — Migration 0017: Document Type fork (G0.1)
--
-- fork_document_type(): atomically copies a built-in Document Type — together
-- with its ordered sections and approval roles — into the caller's workspace as
-- an editable copy (built_in = false, forked_from = source). The original
-- built-in stays canonical (spec §3.4: "Users can fork a built-in to create an
-- editable workspace copy"). SECURITY INVOKER like 0012/0013: the built-in is
-- world-readable (document_types_read), and every insert is governed by the
-- caller's RLS — document_types_write requires owner/admin on the target
-- workspace, so a non-admin fork is denied at the row, not just by canDo.
--
-- A multi-table copy can't be made atomic from the client over PostgREST; this
-- function is the one call site so a fork can never leave a type without its
-- sections.
--
-- Depends on: 0004 (document_types + sections + approval roles).
-- ============================================================================

create or replace function public.fork_document_type(
  p_workspace_id uuid,
  p_source_type_id uuid
)
returns uuid
language plpgsql
-- security invoker (default): the caller's RLS governs every insert below.
set search_path = public
as $$
declare
  v_source   public.document_types%rowtype;
  v_actor    uuid := auth.uid();
  v_new_type uuid;
begin
  -- The source must be a built-in (global, not editable). Forking a workspace
  -- type is out of scope — duplicate-as-new would be a different verb.
  select * into v_source
    from public.document_types
   where id = p_source_type_id and built_in is true and workspace_id is null;
  if not found then
    raise exception 'fork source % is not a built-in document type', p_source_type_id;
  end if;

  insert into public.document_types
    (workspace_id, name, description, built_in, forked_from, created_by, updated_by)
  values
    (p_workspace_id, v_source.name, v_source.description, false, v_source.id, v_actor, v_actor)
  returning id into v_new_type;

  insert into public.document_type_sections
    (workspace_id, document_type_id, name, display_order, spec_field_categories,
     brief_fragment_keys, brief_required, default_block_types, quality_overrides,
     created_by, updated_by)
  select p_workspace_id, v_new_type, s.name, s.display_order, s.spec_field_categories,
         s.brief_fragment_keys, s.brief_required, s.default_block_types, s.quality_overrides,
         v_actor, v_actor
    from public.document_type_sections s
   where s.document_type_id = p_source_type_id
   order by s.display_order;

  insert into public.document_type_approval_roles
    (workspace_id, document_type_id, role_label, required, display_order, created_by, updated_by)
  select p_workspace_id, v_new_type, r.role_label, r.required, r.display_order, v_actor, v_actor
    from public.document_type_approval_roles r
   where r.document_type_id = p_source_type_id
   order by r.display_order;

  return v_new_type;
end;
$$;
