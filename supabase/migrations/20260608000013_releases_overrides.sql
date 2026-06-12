-- ============================================================================
-- Arther — Migration 0013: Releases & overrides (F5.6 / F5.7)
--
-- 1) create_product_release(): atomic snapshot — inserts the release row and
--    pins the CURRENT FieldVersion of every valued field on the product and
--    its attached components in one transaction (impossible atomically over
--    PostgREST from the client). SECURITY INVOKER like 0012: the caller's RLS
--    governs every write (members read / editors write).
-- 2) Release deletion per spec §3.8: "Blocked if any documents were generated
--    from that release. If no documents reference it, deletion is permitted
--    with a confirmation step." 0003 shipped no DELETE policy at all; the
--    spec doc wins — editors may delete while no document was generated from
--    the release. Generation lineage lives on block_spec_references.release_id
--    (0005; its FK is `set null`, so only this guard preserves it).
--    Confirmation lives in the UI.
-- 3) guard_field_type_change(): a field's type may not change while product
--    overrides exist on it (spec §3.5) — prevents silently orphaned values.
-- 4) guard_override_integrity(): overrides are for scalar-family types only
--    (scalar, range, toleranced, enum, boolean — spec §3.5) and must target a
--    field that belongs to the component on the override's edge.
--
-- Depends on: 0003 (spec database), 0005 (documents.release_id).
-- ============================================================================

-- --- 1) Atomic release snapshot -------------------------------------------------
create or replace function public.create_product_release(
  p_product_id uuid,
  p_name       text,
  p_tag        text,
  p_notes      text default null
)
returns uuid
language plpgsql
-- security invoker (default): the caller's RLS governs both inserts below.
set search_path = public
as $$
declare
  v_product    public.products%rowtype;
  v_release_id uuid;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'product % not found or not accessible', p_product_id;
  end if;
  if v_product.archived_at is not null then
    raise exception 'product % is archived; unarchive it before creating a release', p_product_id;
  end if;
  if p_name is null or length(trim(p_name)) = 0
     or p_tag is null or length(trim(p_tag)) = 0 then
    raise exception 'release name and tag are required';
  end if;

  insert into public.product_releases (workspace_id, product_id, name, tag, notes, created_by)
  values (v_product.workspace_id, p_product_id, trim(p_name), trim(p_tag), p_notes, auth.uid())
  returning id into v_release_id;

  -- Pin the current version of every valued, non-archived field on the product
  -- itself and on every component attached to it. Fields never valued have no
  -- version to pin and are skipped — a release captures the state at the
  -- moment of creation (spec §3.8); retroactive releases are not supported.
  insert into public.release_field_values (workspace_id, release_id, field_id, version_id)
  select f.workspace_id, v_release_id, f.id, f.current_version_id
    from public.spec_fields f
   where f.archived_at is null
     and f.current_version_id is not null
     and (f.product_id = p_product_id
          or f.component_id in (select pc.component_id
                                  from public.product_components pc
                                 where pc.product_id = p_product_id));

  return v_release_id;
end;
$$;

-- --- 2) Release deletion: editor-deletable while unreferenced -------------------
create or replace function public.guard_release_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.block_spec_references where release_id = old.id) then
    raise exception 'Release % has documents generated from it; it cannot be deleted', old.id;
  end if;
  return old;
end;
$$;
create trigger product_releases_guard_delete before delete on public.product_releases
  for each row execute function public.guard_release_delete();

-- Pinned values disappear with their release via FK cascade (referential
-- actions bypass RLS); users still cannot delete pins directly.
create policy releases_delete on public.product_releases for delete to authenticated
  using (private.is_workspace_editor(workspace_id));

-- --- 3) Type change blocked while overrides exist (spec §3.5) -------------------
create or replace function public.guard_field_type_change()
returns trigger language plpgsql as $$
begin
  if new.type is distinct from old.type
     and exists (select 1 from public.product_component_overrides where field_id = old.id) then
    raise exception
      'Field % has product overrides; remove them in each product before changing its type', old.id;
  end if;
  return new;
end;
$$;
create trigger spec_fields_guard_type_change before update on public.spec_fields
  for each row execute function public.guard_field_type_change();

-- --- 4) Override integrity: scalar family only, on the right edge ---------------
create or replace function public.guard_override_integrity()
returns trigger language plpgsql as $$
declare
  v_type text;
begin
  select type into v_type from public.spec_fields where id = new.field_id;
  if v_type is null then
    raise exception 'field % not found', new.field_id;
  end if;
  if v_type not in ('scalar','range','toleranced','enum','boolean') then
    raise exception 'Overrides are supported for scalar field types only; % fields cannot be overridden', v_type;
  end if;
  if not exists (
    select 1
      from public.product_components pc
      join public.spec_fields f on f.component_id = pc.component_id
     where pc.id = new.product_component_id
       and f.id = new.field_id
  ) then
    raise exception 'Field % does not belong to the component on edge %',
      new.field_id, new.product_component_id;
  end if;
  return new;
end;
$$;
create trigger pc_overrides_guard_integrity
  before insert or update on public.product_component_overrides
  for each row execute function public.guard_override_integrity();
