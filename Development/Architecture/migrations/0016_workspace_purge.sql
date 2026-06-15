-- ============================================================================
-- Arther — Migration 0016: Workspace purge (F8.7)
-- The replica-mode hard delete for soft-deleted workspaces past their grace
-- period, plus the definer lookup the owner uses to find and restore one.
-- The soft-delete columns + request_workspace_deletion()/cancel_workspace_
-- deletion() RPCs already live in 0002; this migration adds the destruction
-- path (service-role only) and the restore-affordance read.
-- Depends on: 0002.
-- ============================================================================

-- --- Restore affordance: see your own pending-deletion workspace --------------
-- The tenancy helpers (0002) exclude soft-deleted workspaces, so the moment
-- deletion is requested the workspace vanishes from every member's RLS view —
-- including the owner who may want to restore it. This definer read returns the
-- caller's pending-deletion workspace (membership checked DIRECTLY, not via the
-- helpers, which would exclude it) so Settings can render the restore banner.
-- Read-only: restore itself stays owner-gated in cancel_workspace_deletion().
create or replace function public.get_pending_workspace_deletion()
returns table (id uuid, name text, slug text, purge_after timestamptz, role text)
language sql security definer stable set search_path = public as $$
  select w.id, w.name, w.slug::text, w.purge_after, m.role
  from public.workspaces w
  join public.workspace_members m
    on m.workspace_id = w.id and m.user_id = auth.uid()
  where w.deleted_at is not null and w.purge_after > now()
  order by w.deleted_at desc
  limit 1;
$$;

-- --- The purge job: hard-delete expired soft-deleted workspaces ----------------
-- The single sanctioned destruction path (data model §10). Runs as the service
-- role on a schedule (Phase 2 jobs / pg_cron). `session_replication_role =
-- replica` disables the immutability + archive guard triggers (approval_records,
-- published_snapshots, field_versions, release_field_values, the BEFORE DELETE
-- reference guards, the owner-row rule, …) that otherwise block the delete — the
-- one carve-out the data model documents. Replica role ALSO disables foreign-key
-- enforcement, so ON DELETE CASCADE no longer fires; we therefore remove every
-- workspace-owned row EXPLICITLY (order-independent with FK checks off) rather
-- than relying on the cascade, which would leave children orphaned. Every
-- workspace-scoped table carries workspace_id (discovered dynamically so new
-- tables are covered automatically); the lone exception is
-- notification_preferences, scoped via workspace_member_id. Returns the number
-- of workspaces purged. JWT clients can never reach this: there is deliberately
-- no authenticated delete path to the tenant root, and EXECUTE is revoked from
-- everyone but the service role.
create or replace function public.purge_deleted_workspaces()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_tbl text;
begin
  select array_agg(id) into v_ids
  from public.workspaces
  where deleted_at is not null and purge_after is not null and purge_after <= now();

  if v_ids is null then
    return 0;
  end if;

  set local session_replication_role = 'replica';

  -- The one table scoped through a parent (workspace_members), not workspace_id.
  delete from public.notification_preferences np
    using public.workspace_members m
   where np.workspace_member_id = m.id and m.workspace_id = any(v_ids);

  -- Every other workspace-owned table is keyed by workspace_id (incl. audit_log).
  for v_tbl in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'workspace_id'
      and a.attnum > 0
      and not a.attisdropped
      and c.relname <> 'workspaces'
  loop
    execute format('delete from public.%I where workspace_id = any($1)', v_tbl) using v_ids;
  end loop;

  delete from public.workspaces where id = any(v_ids);

  return array_length(v_ids, 1);
end;
$$;

-- The pending-deletion lookup is a member-facing read; the purge is the service
-- role's alone. Explicit revokes because the schema's default privileges grant
-- new routines to authenticated (the local auth shim / Supabase grants).
revoke all on function public.purge_deleted_workspaces() from public, anon, authenticated;
grant execute on function public.purge_deleted_workspaces() to service_role;
grant execute on function public.get_pending_workspace_deletion() to authenticated, service_role;
