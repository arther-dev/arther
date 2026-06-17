-- ============================================================================
-- Arther — Migration 0019: Approval workflow (C1)
-- The AND-logic approval gate over the append-only approval_records (0007),
-- plus the review-cycle counter that lets a rejection reset the collected
-- approvals by SCOPING rather than by deleting the immutable audit trail.
-- record_approval() records an approver's decision and advances the
-- document_revisions state machine (0005) atomically. Depends on: 0001-0008.
-- ============================================================================

-- A review cycle bounds one round of approvals. It increments every time a
-- document (re)enters Review (submit, or pull-back-to-review); each approval is
-- stamped with the cycle it was cast in. AND-logic counts approvals at the
-- CURRENT cycle only — so a rejection (or any return to Draft) resets the slate
-- the moment the next submit starts a new cycle, while the append-only
-- approval_records (the compliance trail) are never deleted (spec §3.4).
alter table public.document_revisions
  add column if not exists review_cycle integer not null default 0;
alter table public.approval_records
  add column if not exists review_cycle integer not null default 0;
create index if not exists approval_records_cycle_idx
  on public.approval_records (revision_id, review_cycle);

-- record_approval — an approver records a decision on a document in Review, and
-- the state machine advances atomically (spec §3.2 / §3.3 / §6):
--   * append the immutable approval_record at the revision's current cycle;
--   * 'rejected' → one rejection returns the document to Draft immediately
--     (reason mandatory); the collected approvals reset via the next cycle;
--   * 'approved' → if EVERY required role of the document's Document Type now
--     has an approval at this cycle, advance Review → Approved.
-- SECURITY DEFINER: approving is a viewer right (billing spec), but the state
-- transition on document_revisions is editor-gated by RLS (0005) — the gate is a
-- SYSTEM action. So the function self-authorizes (the caller must be a member
-- assigned to the role) and writes with definer rights; invoker-side RLS would
-- otherwise block a viewer-approver from completing the gate.
create or replace function public.record_approval(
  p_revision_id uuid,
  p_role_id uuid,
  p_action text,
  p_reason text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ws       uuid;
  v_doc      uuid;
  v_state    text;
  v_cycle    int;
  v_doc_type uuid;
  v_owner    uuid;
  v_required int;
  v_approved int;
begin
  if p_action not in ('approved', 'rejected') then
    raise exception 'Unknown approval action %', p_action;
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
  if p_action = 'rejected' and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'A reason is required to send a document back';
  end if;

  select document_type_id, owner_id into v_doc_type, v_owner from public.documents where id = v_doc;

  -- The document owner cannot review their own document (spec §2.4) — their path
  -- to advance a stuck review is the owner override (C1.5), not a self-approval.
  if v_owner is not null and v_owner = auth.uid() then
    raise exception 'The document owner cannot review their own document';
  end if;

  -- The role must belong to the document's Document Type.
  if not exists (
    select 1 from public.document_type_approval_roles r
    where r.id = p_role_id and r.document_type_id = v_doc_type
  ) then
    raise exception 'That approval role does not belong to this document';
  end if;

  -- Any member assigned to the role may approve for it (spec §4.1) — the caller
  -- must be one (self-authorization, since DEFINER bypasses RLS).
  if not exists (
    select 1 from public.approval_role_assignments a
    join public.workspace_members m on m.id = a.workspace_member_id
    where a.role_id = p_role_id and m.workspace_id = v_ws and m.user_id = auth.uid()
  ) then
    raise exception 'You are not an assigned approver for this role';
  end if;

  -- Append the immutable decision at the current cycle.
  insert into public.approval_records
    (workspace_id, revision_id, role_id, approver_id, action, reason, review_cycle)
  values (v_ws, p_revision_id, p_role_id, auth.uid(), p_action, nullif(btrim(p_reason), ''), v_cycle);

  if p_action = 'rejected' then
    -- One rejection returns immediately to Draft (spec §3.2); approvals reset
    -- when the next submit starts a fresh cycle.
    update public.document_revisions
      set state = 'draft', updated_by = auth.uid()
      where id = p_revision_id and state = 'review';
    return 'draft';
  end if;

  -- AND-logic: every REQUIRED role of the Document Type approved at this cycle.
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

revoke all on function public.record_approval(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_approval(uuid, uuid, text, text) to authenticated;
