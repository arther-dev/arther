-- ============================================================================
-- Arther — Migration 0018: Generation commit RPC (G2.6 / G2.5)
-- commit_generation(): turns a queued/running generation run into a Draft
-- document in ONE transaction — create the document + first revision, insert the
-- produced block tree, and write block_spec_references resolving each referenced
-- field to its CURRENT version. Zero-hallucination (invariant 6): a reference to
-- an unknown / cross-workspace field, or to a field with no value, is rejected
-- and the WHOLE commit rolls back. All-or-nothing — a partial document can never
-- be persisted (G2.6 acceptance). The single-commit guard (document_id already
-- set) makes retries idempotent (G8.1).
--
-- Service-role only, like generation_runs writes (G1.4): the generation pipeline
-- is the sole writer, so EXECUTE is revoked from clients. The caller is
-- authorized by canDo('doc.generate') in the app before the service path runs.
-- Invoker rights — service_role carries BYPASSRLS, and the function scopes every
-- write to the run's workspace explicitly (guardrail 1).
--
-- Depends on: 0003 (spec_fields), 0005 (documents/blocks/refs/generation_runs).
-- ============================================================================

create or replace function public.commit_generation(
  p_run_id uuid,
  p_title  text,
  p_blocks jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_run         public.generation_runs%rowtype;
  v_ws          uuid;
  v_uid         uuid;
  v_document_id uuid;
  v_revision_id uuid;
  v_slug        text;
  v_block       jsonb;
  v_block_id    uuid;
  v_order       integer := 0;
  v_ref         jsonb;
  v_field       public.spec_fields%rowtype;
begin
  select * into v_run from public.generation_runs where id = p_run_id;
  if not found then
    raise exception 'generation run % not found', p_run_id;
  end if;
  if v_run.document_id is not null then
    raise exception 'generation run % is already committed', p_run_id;
  end if;
  if v_run.status not in ('queued', 'running', 'partial') then
    raise exception 'generation run % is % and cannot be committed', p_run_id, v_run.status;
  end if;
  v_ws  := v_run.workspace_id;
  v_uid := v_run.requested_by;

  -- Per-product-unique slug from the title plus a short suffix.
  v_slug := nullif(trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g')), '');
  v_slug := coalesce(left(v_slug, 60), 'document') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.documents
    (workspace_id, product_id, document_type_id, brand_profile_id, title, slug,
     owner_id, created_by, updated_by)
  values
    (v_ws, v_run.product_id, v_run.document_type_id, v_run.brand_profile_id,
     coalesce(nullif(trim(p_title), ''), 'Untitled document'), v_slug,
     v_uid, v_uid, v_uid)
  returning id into v_document_id;

  insert into public.document_revisions
    (workspace_id, document_id, revision_number, state, created_by)
  values
    (v_ws, v_document_id, 1, 'draft', v_uid)
  returning id into v_revision_id;

  update public.documents set current_revision_id = v_revision_id where id = v_document_id;

  -- Insert the block tree in array order; resolve + write spec references.
  for v_block in select value from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb))
  loop
    insert into public.blocks
      (workspace_id, document_id, revision_id, type, display_order, source,
       content, degradation, text_content, created_by)
    values
      (v_ws, v_document_id, v_revision_id,
       v_block->>'type', v_order,
       coalesce(v_block->>'source', 'manual'),
       coalesce(v_block->'content', '{}'::jsonb),
       coalesce(v_block->'degradation', '{}'::jsonb),
       v_block->>'text_content',
       v_uid)
    returning id into v_block_id;
    v_order := v_order + 1;

    for v_ref in select value from jsonb_array_elements(coalesce(v_block->'spec_refs', '[]'::jsonb))
    loop
      select * into v_field from public.spec_fields
        where id = (v_ref->>'field_id')::uuid and workspace_id = v_ws;
      if not found then
        raise exception 'generated block references field % not in this workspace (zero-hallucination)', v_ref->>'field_id';
      end if;
      if v_field.current_version_id is null then
        raise exception 'generated block references field % which has no value', v_ref->>'field_id';
      end if;
      insert into public.block_spec_references
        (workspace_id, block_id, document_id, field_id, field_version_id, reference_type)
      values
        (v_ws, v_block_id, v_document_id, v_field.id, v_field.current_version_id, 'generated');
    end loop;
  end loop;

  update public.generation_runs
     set status = 'succeeded', document_id = v_document_id, completed_at = now()
   where id = p_run_id;

  return v_document_id;
end;
$$;

comment on function public.commit_generation(uuid, text, jsonb) is
  'G2.6/G2.5: atomically commits a generation run into a Draft document (document + revision + block tree + spec references resolved to current field versions); rejects references to unknown/valueless fields (invariant 6). Service-role only.';

revoke all on function public.commit_generation(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_generation(uuid, text, jsonb) to service_role;
