-- ============================================================================
-- Arther — Migration 0021: Publish pipeline (C4)
-- publish_document() — the atomic publish: freeze an APPROVED revision into a
-- versioned, immutable published_snapshots row (block_tree + resolution_manifest
-- + search_text, pdf_ready=false) and flip the revision to Published in one
-- transaction. The block tree is resolved by the app (TS) and passed in (the
-- commit_generation pattern); this is the trusted DB write. Depends on:
-- 0001-0008, 0019/0020.
-- ============================================================================

-- Service-role only (the publish pipeline writes snapshots; a JWT client must
-- never forge a publication — the snapshots_read policy is the only client
-- policy). The app authorizes `doc.publish` + document ownership before reaching
-- here, then calls under the service client (BYPASSRLS), like commit_generation.
-- Attribution is passed in (p_published_by) since the service path has no
-- auth.uid(). Semantic version is a monotonic major per document (1.0, 2.0, …)
-- so the unique(document_id, version) never collides and history is ordered.
create or replace function public.publish_document(
  p_revision_id         uuid,
  p_published_by        uuid,
  p_block_tree          jsonb,
  p_resolution_manifest jsonb,
  p_search_text         text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_ws       uuid;
  v_doc      uuid;
  v_state    text;
  v_product  uuid;
  v_next     integer;
  v_version  text;
  v_snapshot uuid;
begin
  select workspace_id, document_id, state
    into v_ws, v_doc, v_state
    from public.document_revisions where id = p_revision_id;
  if v_ws is null then
    raise exception 'Revision not found';
  end if;
  if v_state <> 'approved' then
    raise exception 'Only an approved document can be published';
  end if;

  select product_id into v_product from public.documents where id = v_doc;

  -- Next semantic version: monotonic major per document.
  select coalesce(max(split_part(version, '.', 1)::int), 0) + 1
    into v_next
    from public.published_snapshots where document_id = v_doc;
  v_version := v_next || '.0';

  insert into public.published_snapshots
    (workspace_id, document_id, product_id, version, block_tree, resolution_manifest,
     search_text, pdf_ready, published_by)
  values (v_ws, v_doc, v_product, v_version, p_block_tree, coalesce(p_resolution_manifest, '[]'::jsonb),
          p_search_text, false, p_published_by)
  returning id into v_snapshot;

  -- Flip the working revision to Published (the C0 transition, now atomic with
  -- the snapshot write).
  update public.document_revisions
    set state = 'published', published_at = now(), published_by = p_published_by, updated_by = p_published_by
    where id = p_revision_id and state = 'approved';

  return v_snapshot;
end;
$$;

revoke all on function public.publish_document(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_document(uuid, uuid, jsonb, jsonb, text) to service_role;
