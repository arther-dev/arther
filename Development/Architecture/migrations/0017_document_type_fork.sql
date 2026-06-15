-- ============================================================================
-- Arther — Migration 0017: Document Type fork (G0.1)
--
-- fork_document_type(): atomically copies a Document Type (the generation
-- schema, 0004) into an editable workspace copy — the type row plus all of its
-- sections and approval-role definitions — in one transaction. Built-in types
-- (workspace_id null) are forkable, not editable (spec §3.4 / Design Decision
-- "Built-in Document Types are forkable, not directly editable"); a fork is the
-- only way to customise one. The same RPC also clones a workspace type, which
-- gives "duplicate" for free.
--
-- SECURITY INVOKER like 0012/0013/0015: the caller's RLS governs every write —
-- the source must be readable (built-in or own-workspace) and the destination
-- inserts pass the owner/admin with-check on document_types / _sections /
-- _approval_roles. No definer bypass is needed because both ends are reachable
-- under the admin's own JWT; this keeps the fork inside the tenant boundary.
--
-- Depends on: 0004 (document_types + sections + approval roles).
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
  v_source  public.document_types%rowtype;
  v_new_id  uuid;
begin
  select * into v_source from public.document_types where id = p_source_id;
  if not found then
    raise exception 'document type % not found or not accessible', p_source_id;
  end if;

  -- The copy is always an editable workspace type: built_in cleared, forked_from
  -- pinned to the source so the lineage back to the canonical built-in survives.
  -- Brand/quality references are intentionally not copied — a built-in carries
  -- none, and a workspace copy picks its own defaults.
  insert into public.document_types
    (workspace_id, name, description, built_in, forked_from, created_by, updated_by)
  values
    (p_workspace_id, v_source.name, v_source.description, false, p_source_id, auth.uid(), auth.uid())
  returning id into v_new_id;

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

  insert into public.document_type_approval_roles
    (workspace_id, document_type_id, role_label, required, display_order, created_by, updated_by)
  select p_workspace_id, v_new_id, r.role_label, r.required, r.display_order, auth.uid(), auth.uid()
    from public.document_type_approval_roles r
   where r.document_type_id = p_source_id
   order by r.display_order;

  return v_new_id;
end;
$$;
