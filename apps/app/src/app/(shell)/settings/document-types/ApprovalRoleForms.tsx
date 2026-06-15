'use client';

import { useActionState, useState } from 'react';
import type { ApprovalRoleRow } from '@arther/db';
import { Button, TextField } from '@arther/ui';
import {
  assignApprovalRoleAction,
  createApprovalRoleAction,
  deleteApprovalRoleAction,
  unassignApprovalRoleAction,
  updateApprovalRoleAction,
  type DocTypeFormState,
} from './actions';

/** A workspace member as an assignable option (id = workspace_members.id). */
export interface ApprovalRoleMember {
  id: string;
  label: string;
}

/**
 * G0.3 — Approval roles editor on a workspace Document Type. Named roles
 * (required/optional) plus the members assigned to fill each one; the Phase 3
 * review machine turns the `required` roles into AND-logic approvals.
 */
export function ApprovalRolesEditor({
  documentTypeId,
  roles,
  members,
}: {
  documentTypeId: string;
  roles: ApprovalRoleRow[];
  members: ApprovalRoleMember[];
}) {
  return (
    <section className="specs-section">
      <h2 className="specs-section__title">Approval roles ({roles.length})</h2>
      <p className="specs-grid__meta">
        Who signs off before a document of this type can publish. Required roles must all approve
        (AND logic); optional roles are advisory. Assign the workspace members who can fill each role.
      </p>
      {roles.length === 0 ? (
        <p className="specs-grid__meta">No approval roles yet — add the first one below.</p>
      ) : (
        <ul className="specs-form" aria-label="Approval roles">
          {roles.map((role) => (
            <li key={role.id} className="specs-release">
              <ApprovalRoleControls role={role} members={members} />
            </li>
          ))}
        </ul>
      )}
      <AddApprovalRoleForm documentTypeId={documentTypeId} />
    </section>
  );
}

function ApprovalRoleControls({
  role,
  members,
}: {
  role: ApprovalRoleRow;
  members: ApprovalRoleMember[];
}) {
  const [editing, setEditing] = useState(false);
  const [deleteState, deleteAction, deletePending] = useActionState<DocTypeFormState, FormData>(
    deleteApprovalRoleAction,
    {},
  );

  const memberLabel = (id: string) => members.find((m) => m.id === id)?.label ?? 'Former member';
  const assignedIds = new Set<string>(role.assignments.map((a) => a.workspace_member_id));
  const unassigned = members.filter((m) => !assignedIds.has(m.id));

  return (
    <>
      <div className="specs-form--row">
        <span>
          {role.role_label}
          {role.required ? (
            <span className="specs-release__tag">required</span>
          ) : (
            <span className="specs-grid__meta"> · optional</span>
          )}
        </span>
        <button type="button" className="specs-value-button" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close' : 'Edit'}
        </button>
        <form
          action={deleteAction}
          className="specs-form--inline"
          onSubmit={(e) => {
            if (!window.confirm(`Delete the “${role.role_label}” approval role?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={role.id} />
          <button
            type="submit"
            className="specs-value-button"
            disabled={deletePending}
            aria-label={`Delete ${role.role_label}`}
          >
            {deletePending ? 'Deleting…' : 'Delete'}
          </button>
        </form>
      </div>
      {deleteState.error ? <span className="ui-field__error">{deleteState.error}</span> : null}

      {editing ? <EditApprovalRoleForm role={role} onDone={() => setEditing(false)} /> : null}

      <div className="specs-grid__meta">
        {role.assignments.length === 0 ? (
          'No members assigned'
        ) : (
          <ul className="specs-form--inline" aria-label={`Members assigned to ${role.role_label}`}>
            {role.assignments.map((a) => (
              <li key={a.id}>
                <UnassignButton roleId={role.id} memberId={a.workspace_member_id} label={memberLabel(a.workspace_member_id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <AssignMemberForm roleId={role.id} unassigned={unassigned} />
    </>
  );
}

function AddApprovalRoleForm({ documentTypeId }: { documentTypeId: string }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    createApprovalRoleAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="documentTypeId" value={documentTypeId} />
      <TextField
        id="approval-role-label"
        name="roleLabel"
        label="New approval role"
        placeholder="Engineering sign-off"
        error={state.error}
      />
      <label className="ui-field__checkbox">
        <input type="checkbox" name="required" defaultChecked />
        Required — must approve before publishing
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Adding…' : 'Add approval role'}
      </Button>
    </form>
  );
}

function EditApprovalRoleForm({ role, onDone }: { role: ApprovalRoleRow; onDone: () => void }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    async (prev, formData) => {
      const result = await updateApprovalRoleAction(prev, formData);
      if (result.done) onDone();
      return result;
    },
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="id" value={role.id} />
      <TextField
        id={`approval-role-label-${role.id}`}
        name="roleLabel"
        label="Role name"
        defaultValue={role.role_label}
        error={state.error}
      />
      <label className="ui-field__checkbox">
        <input type="checkbox" name="required" defaultChecked={role.required} />
        Required — must approve before publishing
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

function AssignMemberForm({
  roleId,
  unassigned,
}: {
  roleId: string;
  unassigned: ApprovalRoleMember[];
}) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    assignApprovalRoleAction,
    {},
  );
  if (unassigned.length === 0) {
    return <p className="specs-grid__meta">All members are assigned to this role.</p>;
  }
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="roleId" value={roleId} />
      <label className="ui-field__label" htmlFor={`assign-${roleId}`}>
        Assign member
      </label>
      <select id={`assign-${roleId}`} name="memberId" className="ui-field__input" defaultValue="">
        <option value="" disabled>
          Choose a member…
        </option>
        {unassigned.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <button type="submit" className="specs-value-button" disabled={pending}>
        {pending ? 'Assigning…' : 'Assign'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

function UnassignButton({
  roleId,
  memberId,
  label,
}: {
  roleId: string;
  memberId: string;
  label: string;
}) {
  const [, action, pending] = useActionState<DocTypeFormState, FormData>(
    unassignApprovalRoleAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="roleId" value={roleId} />
      <input type="hidden" name="memberId" value={memberId} />
      <button
        type="submit"
        className="specs-value-button"
        disabled={pending}
        aria-label={`Remove ${label}`}
      >
        {label} ✕
      </button>
    </form>
  );
}
