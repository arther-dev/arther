-- ============================================================================
-- Arther — Migration 0017: Document Type forking + delete guard (G0.1)
--
-- The Document Type IS the generation schema (Phase 2 G0), so it ships its
-- management surface before anything generates. 0004 created the tables and
-- seeded the five built-ins; this adds the two behaviours the CRUD surface
-- needs that can't be expressed atomically over PostREST from the client:
--
-- 1) fork_document_type(): a built-in (or any readable type) is forkable, not
--    editable (spec §3.4) — the user gets an editable workspace copy. Copying
--    the type row, its ordered section schema, AND its approval roles must be
--    one transaction, so it's an RPC. SECURITY INVOKER (like 0012/0013): the
--    caller's admin RLS on document_types governs every insert — built-ins
--    (workspace_id null) are read-only to clients, workspace copies are
--    admin-writable, so a non-admin's fork is rejected by the write policy.
-- 2) guard_document_type_delete(): archive-when-referenced (spec §3.8). The
--    documents.document_type_id FK (0005) already blocks the delete, but with a
--    raw FK error; this raises the friendly "archive instead" message, matching
--    guard_release_delete (0013). Built-ins can't be deleted by users anyway
--    (the 0004 write policy requires workspace_id not null).
--
-- Depends on: 0004 (document types/sections/roles), 0005 (documents).
-- ============================================================================

-- --- 1) Atomic fork: type + sections + approval roles ---------------------------
create or replace function public.fork_document_type(
  p_source_id    uuid,
  p_workspace_id uuid
)
returns uuid
language plpgsql
-- security invoker (default): the caller's RLS governs the reads and every
-- insert below; the admin-only write policy on document_types gates the fork.
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

  -- The copy is always a workspace type (built_in false), tracing its origin
  -- via forked_from so Arther can still improve the canonical built-in (§3.4).
  insert into public.document_types
    (workspace_id, name, description, built_in, forked_from,
     default_brand_profile_id, quality_standard_id, created_by)
  values
    (p_workspace_id, v_source.name, v_source.description, false, v_source.id,
     v_source.default_brand_profile_id, v_source.quality_standard_id, auth.uid())
  returning id into v_new_id;

  -- The section schema is the heart of the type — copy every section with its
  -- full data contract (categories, brief keys, required flag, block defaults,
  -- quality overrides) and original ordering.
  insert into public.document_type_sections
    (workspace_id, document_type_id, name, display_order, spec_field_categories,
     brief_fragment_keys, brief_required, default_block_types, quality_overrides, created_by)
  select p_workspace_id, v_new_id, s.name, s.display_order, s.spec_field_categories,
         s.brief_fragment_keys, s.brief_required, s.default_block_types, s.quality_overrides,
         auth.uid()
  from public.document_type_sections s
  where s.document_type_id = p_source_id;

  -- Approval roles travel with the type (member assignments do not — they're
  -- per-workspace and reattached after forking, G0.3).
  insert into public.document_type_approval_roles
    (workspace_id, document_type_id, role_label, required, display_order, created_by)
  select p_workspace_id, v_new_id, r.role_label, r.required, r.display_order, auth.uid()
  from public.document_type_approval_roles r
  where r.document_type_id = p_source_id;

  return v_new_id;
end;
$$;

-- --- 2) Archive-when-referenced delete guard (spec §3.8) ------------------------
create or replace function public.guard_document_type_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.documents where document_type_id = old.id) then
    raise exception
      'Document type % has documents generated from it; archive it instead of deleting', old.id;
  end if;
  return old;
end;
$$;
create trigger document_types_guard_delete before delete on public.document_types
  for each row execute function public.guard_document_type_delete();
