-- ============================================================================
-- Arther — Migration 0012: Spec field RPCs
-- Atomic field-value updates (F5.5): one call inserts the append-only
-- field_versions row, moves spec_fields.current_version_id, and updates the
-- working value — a single transaction, impossible to do atomically over
-- PostgREST from the client. SECURITY INVOKER: RLS applies to the caller
-- (members read / editors write), so this adds no privilege surface.
-- Depends on: 0003.
-- ============================================================================

create or replace function public.update_spec_field_value(
  p_field_id uuid,
  p_value    jsonb,
  p_note     text default null
)
returns uuid
language plpgsql
-- security invoker (default): the caller's RLS governs both writes below.
set search_path = public
as $$
declare
  v_field      public.spec_fields%rowtype;
  v_version_id uuid;
  v_diff       jsonb;
begin
  select * into v_field from public.spec_fields where id = p_field_id;
  if not found then
    raise exception 'spec field % not found or not accessible', p_field_id;
  end if;
  if v_field.archived_at is not null then
    raise exception 'spec field % is archived; unarchive it before editing', p_field_id;
  end if;

  -- Structured before/after diff for scalar-family types; table fields get
  -- row-level diffs computed in the app (spec §3.7) and passed via versions
  -- written through this same path.
  v_diff := jsonb_build_object('before', v_field.value, 'after', p_value);

  -- Versions are append-only (no-update trigger): note goes in at insert.
  insert into public.field_versions (workspace_id, field_id, value, diff, changed_by, note)
  values (v_field.workspace_id, p_field_id, p_value, v_diff, auth.uid(), p_note)
  returning id into v_version_id;

  update public.spec_fields
     set value = p_value,
         current_version_id = v_version_id,
         updated_by = auth.uid()
   where id = p_field_id;

  return v_version_id;
end;
$$;
