-- ============================================================================
-- Arther — Migration 0020: Approval owner override (C1.5)
-- The document owner's escape hatch when a required approver is unavailable and
-- a release is blocked: record an `owner_override` on behalf of a role and
-- advance the AND-logic gate, with a mandatory reason written to the immutable
-- audit_log (spec §3.3). Depends on: 0001-0008, 0019.
-- ============================================================================

-- override_approval — the document owner (or a workspace admin) approves on
-- behalf of a role's missing reviewer. Distinct from a normal approval: it
-- records action 'owner_override' with the overridden role label and a mandatory
-- reason, and writes a flagged audit_log entry (never presented as equivalent to
-- a real approval). Then it re-evaluates the same AND-logic gate as
-- record_approval (overrides count toward completion). SECURITY DEFINER:
-- self-authorizes the caller is the document owner or a workspace admin, and
-- writes the audit_log row (which is deny-all to clients) + the editor-gated
-- state transition with definer rights.
create or replace function public.override_approval(
  p_revision_id uuid,
  p_role_id uuid,
  p_reason text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ws          uuid;
  v_doc         uuid;
  v_state       text;
  v_cycle       int;
  v_doc_type    uuid;
  v_owner       uuid;
  v_caller_role text;
  v_role_label  text;
  v_required    int;
  v_approved    int;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'An override reason is required';
  end if;

  select workspace_id, document_id, state, review_cycle
    into v_ws, v_doc, v_state, v_cycle
    from public.document_revisions where id = p_revision_id;
  if v_ws is null then
    raise exception 'Revision not found';
  end if;
  if v_state <> 'review' then
    raise exception 'This document is not in review';
  end if;

  select document_type_id, owner_id into v_doc_type, v_owner
    from public.documents where id = v_doc;

  -- Only the document owner or a workspace admin/owner may override (spec §4.3).
  -- coalesce both arms to false so a non-member (NULL role) can never slip through
  -- a three-valued `NOT (… OR NULL)` — that is NULL, which plpgsql treats as false.
  select role into v_caller_role from public.workspace_members
    where workspace_id = v_ws and user_id = auth.uid();
  if not (coalesce(v_owner = auth.uid(), false) or coalesce(v_caller_role in ('owner', 'admin'), false)) then
    raise exception 'Only the document owner or a workspace admin can override approvals';
  end if;

  select role_label into v_role_label from public.document_type_approval_roles
    where id = p_role_id and document_type_id = v_doc_type;
  if v_role_label is null then
    raise exception 'That approval role does not belong to this document';
  end if;

  -- The immutable record carries the overridden role label + reason (spec §10.3).
  insert into public.approval_records
    (workspace_id, revision_id, role_id, approver_id, action, reason, override_on_behalf_of, review_cycle)
  values (v_ws, p_revision_id, p_role_id, auth.uid(), 'owner_override', btrim(p_reason), v_role_label, v_cycle);

  -- The override is a distinct, flagged audit entry (never a normal approval).
  insert into public.audit_log (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (v_ws, auth.uid(), 'document.approval_overridden', 'document_revision', p_revision_id,
          jsonb_build_object('document_id', v_doc, 'role_id', p_role_id,
                             'role_label', v_role_label, 'reason', btrim(p_reason)));

  -- AND-logic: every REQUIRED role approved (or overridden) at this cycle.
  select count(*) into v_required
    from public.document_type_approval_roles r
    where r.document_type_id = v_doc_type and r.required;
  select count(distinct ar.role_id) into v_approved
    from public.approval_records ar
    join public.document_type_approval_roles r on r.id = ar.role_id
    where ar.revision_id = p_revision_id and ar.review_cycle = v_cycle
      and ar.action in ('approved', 'owner_override') and r.required;

  if v_required > 0 and v_approved >= v_required then
    update public.document_revisions
      set state = 'approved', updated_by = auth.uid()
      where id = p_revision_id and state = 'review';
    return 'approved';
  end if;

  return 'review';
end;
$$;

revoke all on function public.override_approval(uuid, uuid, text) from public, anon;
grant execute on function public.override_approval(uuid, uuid, text) to authenticated;
