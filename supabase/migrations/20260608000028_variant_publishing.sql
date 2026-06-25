-- ============================================================================
-- Arther — Migration 0028: Per-variant publishing (V.9)
-- Lets a product variant publish its own frozen portal snapshot, independent of
-- the base document and of sibling variants. published_snapshots already carries
-- a (frozen) variant_id column (0008) with its FK to product_variants (0010);
-- this migration (a) makes snapshot version-uniqueness variant-scoped so a base
-- publication and each variant publication can share a document_id without
-- colliding, and (b) extends publish_document() to stamp variant_id and sequence
-- versions per (document, variant) line. The per-variant block tree is resolved
-- by the app (the variant's delta-applied spec + block visibility) and passed in,
-- exactly like the base publish. Depends on: 0001-0010, 0021.
-- ============================================================================

-- --- Variant-scoped snapshot version uniqueness ------------------------------
-- 0008 declared UNIQUE(document_id, version): one version line per document. With
-- per-variant snapshots the base (variant_id IS NULL) and each variant share the
-- document_id, so uniqueness must include the variant. Two partial unique indexes
-- keep the base line distinct from every variant line WITHOUT relying on NULL
-- comparison semantics — a plain UNIQUE(document_id, variant_id, version) would
-- treat each NULL variant_id as distinct and wrongly allow duplicate base
-- versions.
alter table public.published_snapshots
  drop constraint published_snapshots_document_id_version_key;

create unique index published_snapshots_base_version_uq
  on public.published_snapshots (document_id, version)
  where variant_id is null;

create unique index published_snapshots_variant_version_uq
  on public.published_snapshots (document_id, variant_id, version)
  where variant_id is not null;

create index published_snapshots_variant_idx
  on public.published_snapshots (variant_id)
  where variant_id is not null;

-- --- publish_document(): stamp variant_id, sequence versions per variant line -
-- Re-created with a new trailing p_variant_id (default null keeps the existing
-- base-publish call site unchanged). The old 5-arg overload is dropped so there
-- is exactly one function identity. When p_variant_id is null this is the
-- unchanged base publish (requires an approved revision and flips it to
-- published). When p_variant_id is set it freezes a variant snapshot from the
-- same already-approved/published revision and does NOT touch the revision
-- lifecycle — a variant is an additional portal page over an already-live
-- document (spec §4.5: "publishing variant A does not publish variant B").
drop function if exists public.publish_document(uuid, uuid, jsonb, jsonb, text);

create or replace function public.publish_document(
  p_revision_id         uuid,
  p_published_by        uuid,
  p_block_tree          jsonb,
  p_resolution_manifest jsonb,
  p_search_text         text,
  p_variant_id          uuid default null
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

  if p_variant_id is null then
    if v_state <> 'approved' then
      raise exception 'Only an approved document can be published';
    end if;
  else
    -- A variant publishes over an already-live document; its revision must have
    -- cleared approval at least once.
    if v_state not in ('approved', 'published') then
      raise exception 'Publish the base document before publishing a variant';
    end if;
    -- The variant must belong to this document's product (the FK alone only
    -- guarantees it is *a* variant, not one of this product's).
    if not exists (
      select 1
        from public.product_variants pv
        join public.documents d on d.product_id = pv.product_id
       where pv.id = p_variant_id and d.id = v_doc
    ) then
      raise exception 'Variant does not belong to this document''s product';
    end if;
  end if;

  select product_id into v_product from public.documents where id = v_doc;

  -- Next semantic version: monotonic major per (document, variant line). The base
  -- line (variant_id IS NULL) and each variant line sequence independently.
  select coalesce(max(split_part(version, '.', 1)::int), 0) + 1
    into v_next
    from public.published_snapshots
   where document_id = v_doc
     and variant_id is not distinct from p_variant_id;
  v_version := v_next || '.0';

  insert into public.published_snapshots
    (workspace_id, document_id, product_id, variant_id, version, block_tree,
     resolution_manifest, search_text, pdf_ready, published_by)
  values (v_ws, v_doc, v_product, p_variant_id, v_version, p_block_tree,
          coalesce(p_resolution_manifest, '[]'::jsonb), p_search_text, false, p_published_by)
  returning id into v_snapshot;

  -- Base publish flips the working revision to Published (the C0 transition,
  -- atomic with the snapshot write); a variant publish leaves it untouched.
  if p_variant_id is null then
    update public.document_revisions
      set state = 'published', published_at = now(), published_by = p_published_by, updated_by = p_published_by
      where id = p_revision_id and state = 'approved';
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.publish_document(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.publish_document(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;
