-- ============================================================================
-- Arther — Migration 0017: Document Type fork (G0.1)
--
-- fork_document_type(p_source_id, p_workspace_id): atomically copies a Document
-- Type (a built-in, or another type the caller can read) into the caller's
-- workspace as an editable copy — the type row, every section, and every
-- approval role, in one transaction. `forked_from` links the copy to its
-- source. SECURITY INVOKER (like 0012/0013): the caller's RLS governs every
-- read and write, so they can only fork what they can read (built-ins are
-- global; workspace types need membership) into a workspace where they are
-- owner/admin (the 0004 write policies enforce the with-check).
--
-- Built-in types stay canonical: a built-in has workspace_id null, and the 0004
-- write policy requires `workspace_id is not null`, so a built-in can never be
-- edited in place — forking is the only path to customise one (spec §3.4,
-- "forkable, not directly editable").
--
-- Multi-row copy can't be done atomically over PostgREST from the client (same
-- rationale as create_product_release / commit_import_session); hence the RPC.
-- The default brand/quality references are carried over by id: a built-in
-- carries none, and a workspace-type source is in the caller's own workspace,
-- so the copy never points at another tenant's config.
--
-- Depends on: 0004 (document_types, document_type_sections, approval roles).
-- ============================================================================

create or replace function public.fork_document_type(
  p_source_id    uuid,
  p_workspace_id uuid
)
returns uuid
language plpgsql
-- security invoker (default): caller RLS governs the source read and every insert.
set search_path = public
as $$
declare
  v_source public.document_types%rowtype;
  v_new_id uuid;
begin
  select * into v_source from public.document_types where id = p_source_id;
  if not found then
    raise exception 'document type % not found or not accessible', p_source_id;
  end if;

  -- The new type row. workspace_id + the owner/admin with-check (0004) is what
  -- gates the whole fork — a non-admin's insert raises here and rolls back.
  insert into public.document_types
    (workspace_id, name, description, built_in, forked_from,
     default_brand_profile_id, quality_standard_id, created_by, updated_by)
  values
    (p_workspace_id, v_source.name, v_source.description, false, v_source.id,
     v_source.default_brand_profile_id, v_source.quality_standard_id, auth.uid(), auth.uid())
  returning id into v_new_id;

  -- Copy the section schema (the data contract) in display order.
  insert into public.document_type_sections
    (workspace_id, document_type_id, name, display_order, spec_field_categories,
     brief_fragment_keys, brief_required, default_block_types, quality_overrides,
     created_by, updated_by)
  select p_workspace_id, v_new_id, s.name, s.display_order, s.spec_field_categories,
         s.brief_fragment_keys, s.brief_required, s.default_block_types, s.quality_overrides,
         auth.uid(), auth.uid()
    from public.document_type_sections s
   where s.document_type_id = p_source_id
   order by s.display_order;

  -- Copy the approval-role configuration (member assignments are not copied —
  -- they reference workspace_members, configured per workspace in Phase 3).
  insert into public.document_type_approval_roles
    (workspace_id, document_type_id, role_label, required, display_order, created_by, updated_by)
  select p_workspace_id, v_new_id, r.role_label, r.required, r.display_order, auth.uid(), auth.uid()
    from public.document_type_approval_roles r
   where r.document_type_id = p_source_id;

  return v_new_id;
end;
$$;
