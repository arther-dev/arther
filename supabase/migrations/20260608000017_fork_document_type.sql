-- ============================================================================
-- Arther — Migration 0017: Fork a Document Type (G0.1)
--
-- fork_document_type(): atomically clones a Document Type into a workspace —
-- the type row, all its sections, and all its approval roles in one transaction
-- (impossible atomically over PostgREST from the client; a mid-copy failure
-- would otherwise leave an orphaned type with no sections). This is how a
-- built-in (workspace_id null, not editable) becomes an editable workspace copy
-- (generator spec §3.4: "fork a built-in to create an editable workspace
-- copy"), and how a workspace duplicates one of its own types.
--
-- SECURITY INVOKER (default), like 0012/0013: the caller's RLS governs every
-- statement — the source must be readable (a built-in or own-workspace type)
-- and the INSERTs are admin-gated by the 0004 document_types_write /
-- dts_write / dtar_write policies (defence in depth behind canDo).
--
-- Depends on: 0004 (document_types + sections + approval roles).
-- ============================================================================

create or replace function public.fork_document_type(
  p_source_id    uuid,
  p_workspace_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_source public.document_types%rowtype;
  v_new_id uuid;
begin
  -- Readable only if it's a built-in or belongs to a workspace the caller is in
  -- (0004 document_types_read); anything else surfaces as "not found".
  select * into v_source from public.document_types where id = p_source_id;
  if not found then
    raise exception 'document type % not found or not accessible', p_source_id;
  end if;

  insert into public.document_types
    (workspace_id, name, description, built_in, forked_from,
     default_brand_profile_id, quality_standard_id, created_by, updated_by)
  values
    (p_workspace_id, v_source.name, v_source.description, false, v_source.id,
     v_source.default_brand_profile_id, v_source.quality_standard_id, auth.uid(), auth.uid())
  returning id into v_new_id;

  insert into public.document_type_sections
    (workspace_id, document_type_id, name, display_order, spec_field_categories,
     brief_fragment_keys, brief_required, default_block_types, quality_overrides,
     created_by, updated_by)
  select p_workspace_id, v_new_id, s.name, s.display_order, s.spec_field_categories,
         s.brief_fragment_keys, s.brief_required, s.default_block_types, s.quality_overrides,
         auth.uid(), auth.uid()
  from public.document_type_sections s
  where s.document_type_id = p_source_id;

  insert into public.document_type_approval_roles
    (workspace_id, document_type_id, role_label, required, display_order, created_by, updated_by)
  select p_workspace_id, v_new_id, r.role_label, r.required, r.display_order, auth.uid(), auth.uid()
  from public.document_type_approval_roles r
  where r.document_type_id = p_source_id;

  return v_new_id;
end;
$$;

comment on function public.fork_document_type(uuid, uuid) is
  'G0.1: atomically clone a Document Type (row + sections + approval roles) into a workspace as an editable copy. Invoker rights; 0004 admin-write policies govern the inserts.';
