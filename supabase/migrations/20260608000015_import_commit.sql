-- ============================================================================
-- Arther — Migration 0015: Import commit RPC (F7.6)
-- commit_import_session(): applies an import session's reviewed mutation plan
-- in ONE transaction — create the product (first import), create/attach
-- components (with BOM nesting), create fields, set values through the 0012
-- versioning RPC — then auto-creates the import release (the one exception to
-- "releases are explicit user action"; spec §3.8/§6.2 step 5) and stamps the
-- session committed. Impossible to do atomically over PostgREST from the
-- client; partial imports must never exist (F7 acceptance: no partial commit).
--
-- SECURITY INVOKER like 0012/0013: the caller's RLS governs every write
-- (editors only — the import_sessions update policy and every insert policy
-- below it are editor-gated). The function trusts the session's stored
-- proposed_mutations, which the app writes Zod-validated at commit time; RLS
-- still bounds everything to the caller's workspace, and update_spec_field_value
-- re-checks field accessibility per value.
--
-- Depends on: 0003 (spec database, import_sessions), 0012, 0013.
-- ============================================================================

create or replace function public.commit_import_session(p_session_id uuid)
returns uuid
language plpgsql
-- security invoker (default): the caller's RLS governs all writes below.
set search_path = public
as $$
declare
  v_session    public.import_sessions%rowtype;
  v_uid        uuid := auth.uid();
  v_product_id uuid;
  v_mut        jsonb;
  v_components jsonb := '{}'::jsonb;  -- plan ckey -> created component id
  v_edges      jsonb := '{}'::jsonb;  -- component id -> created edge id (nesting)
  v_id         uuid;
  v_component  uuid;
  v_parent     uuid;
  v_edge_id    uuid;
  v_field_id   uuid;
  v_note       text;
begin
  select * into v_session from public.import_sessions where id = p_session_id for update;
  if not found then
    raise exception 'import session % not found or not accessible', p_session_id;
  end if;
  if v_session.status <> 'proposed' then
    raise exception 'import session is %, expected proposed', v_session.status;
  end if;

  v_product_id := v_session.target_product_id;
  v_note := 'Imported from ' || coalesce(v_session.source_filename, 'spreadsheet');

  for v_mut in select value from jsonb_array_elements(v_session.proposed_mutations)
  loop
    case v_mut->>'kind'

    when 'create_product' then
      insert into public.products (workspace_id, name, description, created_by, updated_by)
      values (v_session.workspace_id, v_mut->>'name', v_mut->>'description', v_uid, v_uid)
      returning id into v_product_id;

    when 'create_component' then
      insert into public.components (workspace_id, name, type, created_by, updated_by)
      values (v_session.workspace_id, v_mut->>'name',
              coalesce(v_mut->>'componentType', 'part'), v_uid, v_uid)
      returning id into v_id;
      v_components := jsonb_set(v_components, array[v_mut->>'ckey'], to_jsonb(v_id::text));

    when 'attach_component' then
      if v_product_id is null then
        raise exception 'attach_component before any product exists';
      end if;
      v_component := coalesce(
        (v_mut->>'componentId')::uuid,
        (v_components->>(v_mut->>'ckey'))::uuid
      );
      if v_component is null then
        raise exception 'attach_component could not resolve component "%"', v_mut->>'componentName';
      end if;
      -- Nesting references the PARENT'S EDGE within this product (0003).
      v_parent := coalesce(
        (v_mut->>'parentComponentId')::uuid,
        (v_components->>(v_mut->>'parentCkey'))::uuid
      );
      v_edge_id := null;
      if v_parent is not null then
        v_edge_id := (v_edges->>(v_parent::text))::uuid;
      end if;
      insert into public.product_components
        (workspace_id, product_id, component_id, parent_component_id, quantity, created_by, updated_by)
      values (v_session.workspace_id, v_product_id, v_component, v_edge_id,
              coalesce((v_mut->>'quantity')::integer, 1), v_uid, v_uid)
      returning id into v_id;
      v_edges := jsonb_set(v_edges, array[v_component::text], to_jsonb(v_id::text));

    when 'create_field' then
      v_component := null;
      if v_mut->'owner'->>'kind' = 'component' then
        v_component := coalesce(
          (v_mut->'owner'->>'componentId')::uuid,
          (v_components->>(v_mut->'owner'->>'ckey'))::uuid
        );
        if v_component is null then
          raise exception 'create_field could not resolve its owner component';
        end if;
      elsif v_product_id is null then
        raise exception 'create_field before any product exists';
      end if;
      insert into public.spec_fields
        (workspace_id, component_id, product_id, name, type, category, unit_id,
         options, conditions, created_by, updated_by)
      values
        (v_session.workspace_id,
         v_component,
         case when v_component is null then v_product_id else null end,
         v_mut->>'name',
         v_mut->>'fieldType',
         v_mut->>'category',
         (v_mut->>'unitId')::uuid,
         v_mut->'options',
         v_mut->>'conditions',
         v_uid, v_uid)
      returning id into v_field_id;
      if v_mut->'value' is not null and jsonb_typeof(v_mut->'value') <> 'null' then
        perform public.update_spec_field_value(v_field_id, v_mut->'value', v_note);
      end if;

    when 'set_value' then
      perform public.update_spec_field_value(
        (v_mut->>'fieldId')::uuid, v_mut->'newValue', v_note);

    -- Review/diff rows: stored for the audit trail, nothing to apply. A
    -- re-import with zero applied changes still commits — the release below
    -- snapshots "this sheet matches the database as of now".
    when 'unchanged', 'missing_from_sheet', 'type_conflict' then
      null;

    else
      raise exception 'unknown import mutation kind "%"', v_mut->>'kind';
    end case;
  end loop;

  if v_product_id is null then
    raise exception 'import session % has no target product and no create_product mutation', p_session_id;
  end if;

  -- Import always commits as a named release — the initial entry in the
  -- product's release history (spec §6.2 step 5). Tag is second-precision to
  -- stay unique across same-day re-imports.
  perform public.create_product_release(
    v_product_id,
    v_note || ' — ' || to_char(now(), 'FMMonth YYYY'),
    'import-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
    null);

  update public.import_sessions
     set status = 'committed',
         committed_at = now(),
         target_product_id = v_product_id,
         updated_by = v_uid
   where id = p_session_id;

  return v_product_id;
end;
$$;

comment on function public.commit_import_session(uuid) is
  'F7.6: atomically applies a reviewed import plan (product/components/edges/fields/values via 0012) and auto-creates the import release (0013). Invoker rights — editor RLS governs.';
