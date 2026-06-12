-- ============================================================================
-- Arther — Migration 0014: Membership governance (F4.2 / F4.3 / F4.4)
--
-- 1) guard_member_owner_rules(): EXACTLY ONE OWNER per workspace, enforced at
--    the row. Closes a real 0002 policy gap: members_write lets admins write
--    any role — including minting themselves 'owner'. Outside the transfer
--    RPC (transaction-scoped GUC), owner rows cannot be created (beyond the
--    first, which create_workspace() inserts), demoted, or deleted — which
--    also enforces F4.2's "removal blocked until ownership transferred".
-- 2) transfer_workspace_ownership(): atomic owner→admin + member→owner +
--    workspaces.owner_id. SECURITY DEFINER; only the current owner may call.
-- 3) get_workspace_invitation() / accept_workspace_invitation(): the invitee
--    is not yet a member, so RLS (admin-scoped invitations_manage) hides the
--    row from exactly the person it's for. DEFINER RPCs expose the minimal
--    surface: status lookup by unguessable id, and an accept that checks the
--    caller's email, expiry, and revocation before inserting the membership.
--
-- Depends on: 0002 (identity/workspace), 0003 (create_workspace).
-- ============================================================================

-- --- 1) Owner-row governance ----------------------------------------------------
create or replace function public.guard_member_owner_rules()
returns trigger language plpgsql as $$
declare
  v_ws uuid;
  v_in_transfer boolean;
begin
  v_ws := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  v_in_transfer := coalesce(current_setting('arther.ownership_transfer', true), '') = v_ws::text;

  if tg_op = 'INSERT' then
    if new.role = 'owner'
       and exists (select 1 from public.workspace_members
                    where workspace_id = v_ws and role = 'owner') then
      raise exception 'workspace % already has an owner', v_ws;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role is distinct from 'owner' and not v_in_transfer then
      raise exception 'transfer ownership before changing the owner''s role';
    end if;
    if new.role = 'owner' and old.role is distinct from 'owner' and not v_in_transfer then
      raise exception 'ownership changes only through transfer_workspace_ownership()';
    end if;
    return new;
  end if;

  -- DELETE: the owner's membership is removable only mid-transfer (it isn't)
  -- or by the replica-mode workspace purge (triggers disabled there, F8.7).
  if old.role = 'owner' and not v_in_transfer then
    raise exception 'the owner cannot be removed; transfer ownership first';
  end if;
  return old;
end;
$$;
create trigger workspace_members_owner_rules
  before insert or update or delete on public.workspace_members
  for each row execute function public.guard_member_owner_rules();

-- --- 2) Atomic ownership transfer (F4.4) ----------------------------------------
create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner    uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.workspace_members
                  where workspace_id = p_workspace_id and user_id = v_uid and role = 'owner') then
    raise exception 'only the workspace owner may transfer ownership';
  end if;
  if p_new_owner = v_uid then
    raise exception 'you already own this workspace';
  end if;
  if not exists (select 1 from public.workspace_members
                  where workspace_id = p_workspace_id and user_id = p_new_owner) then
    raise exception 'the new owner must already be a workspace member';
  end if;

  -- Transaction-scoped escape hatch for the owner-rules trigger.
  perform set_config('arther.ownership_transfer', p_workspace_id::text, true);
  update public.workspace_members
     set role = 'admin', updated_by = v_uid
   where workspace_id = p_workspace_id and user_id = v_uid;
  update public.workspace_members
     set role = 'owner', updated_by = v_uid
   where workspace_id = p_workspace_id and user_id = p_new_owner;
  update public.workspaces
     set owner_id = p_new_owner, updated_by = v_uid
   where id = p_workspace_id;
  perform set_config('arther.ownership_transfer', '', true);
end;
$$;

-- --- 3) Invitation lookup + acceptance (F4.3) ------------------------------------
-- Minimal disclosure by unguessable invitation id: enough to render the
-- accept page (workspace name, invited email, role, status) — nothing else.
create or replace function public.get_workspace_invitation(p_invitation_id uuid)
returns table (workspace_name text, email citext, role text, status text)
language sql security definer set search_path = public as $$
  select w.name,
         i.email,
         i.role,
         case
           when i.revoked_at  is not null then 'revoked'
           when i.accepted_at is not null then 'accepted'
           when i.expires_at < now()      then 'expired'
           else 'pending'
         end
    from public.workspace_invitations i
    join public.workspaces w on w.id = i.workspace_id
   where i.id = p_invitation_id;
$$;

create or replace function public.accept_workspace_invitation(p_invitation_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email citext;
  v_inv   public.workspace_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select email into v_email from public.users where id = v_uid;

  select * into v_inv from public.workspace_invitations
   where id = p_invitation_id for update;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation revoked';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation already accepted';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation expired';
  end if;
  if v_inv.email is distinct from v_email then
    raise exception 'this invitation was sent to a different email address';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v_inv.workspace_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
     set accepted_at = now()
   where id = p_invitation_id;

  return v_inv.workspace_id;
end;
$$;
