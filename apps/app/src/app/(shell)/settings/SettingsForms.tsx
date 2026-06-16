'use client';

import { useActionState, useState } from 'react';
import type { InvitationRow, MemberRow } from '@arther/db';
import { Button, TextField } from '@arther/ui';
import {
  cancelWorkspaceDeletionAction,
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  removeWorkspaceLogoAction,
  renameWorkspaceAction,
  requestWorkspaceDeletionAction,
  revokeInvitationAction,
  transferOwnershipAction,
  uploadWorkspaceLogoAction,
  type SettingsFormState,
} from './actions';

export function RenameWorkspaceForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    renameWorkspaceAction,
    {},
  );
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <TextField
        id="workspace-name"
        name="name"
        label="Workspace name"
        defaultValue={currentName}
        error={state.error}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Rename'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Saved.</p> : null}
    </form>
  );
}

/** F4.5 — workspace logo: shows the current mark, uploads a new one, or clears it. */
export function WorkspaceLogoForm({ logoUrl }: { logoUrl: string | null }) {
  const [upState, upAction, upPending] = useActionState<SettingsFormState, FormData>(
    uploadWorkspaceLogoAction,
    {},
  );
  const [rmState, rmAction, rmPending] = useActionState<SettingsFormState, FormData>(
    removeWorkspaceLogoAction,
    {},
  );
  return (
    <div className="specs-form" style={{ gap: 8 }}>
      <div className="specs-form--row" style={{ gap: 12, alignItems: 'center' }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Workspace logo"
            style={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 6 }}
          />
        ) : (
          <span className="specs-grid__meta">No logo yet.</span>
        )}
        <form action={upAction} className="specs-form--row" style={{ gap: 6 }}>
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
            aria-label="Workspace logo file"
            className="ui-field__input"
          />
          <Button type="submit" size="sm" disabled={upPending}>
            {upPending ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
        {logoUrl ? (
          <form action={rmAction}>
            <Button type="submit" size="sm" variant="ghost" disabled={rmPending}>
              {rmPending ? 'Removing…' : 'Remove'}
            </Button>
          </form>
        ) : null}
      </div>
      {upState.error ? <p className="ui-field__error">{upState.error}</p> : null}
      {rmState.error ? <p className="ui-field__error">{rmState.error}</p> : null}
      {upState.done || rmState.done ? <p className="specs-grid__meta">Saved.</p> : null}
      <p className="specs-grid__meta">PNG, JPEG, SVG, WebP, or GIF · up to 2 MB.</p>
    </div>
  );
}

/** Role select (admin/member/viewer) — the owner row gets transfer instead (F4.4). */
export function MemberControls({
  member,
  isSelf,
  canManage,
  isOwnerViewing,
}: {
  member: MemberRow;
  isSelf: boolean;
  canManage: boolean;
  /** Transfer is offered only to the current owner. */
  isOwnerViewing: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState<SettingsFormState, FormData>(
    changeRoleAction,
    {},
  );
  const [removeState, removeAction, removePending] = useActionState<SettingsFormState, FormData>(
    removeMemberAction,
    {},
  );
  const [transferState, transferAction, transferPending] = useActionState<
    SettingsFormState,
    FormData
  >(transferOwnershipAction, {});

  if (member.role === 'owner') {
    return <span className="specs-grid__meta">Owner</span>;
  }
  if (!canManage) {
    return <span className="specs-grid__meta">{member.role}</span>;
  }

  return (
    <span className="specs-form--row">
      <form action={roleAction} className="specs-form--inline">
        <input type="hidden" name="memberId" value={member.id} />
        <label className="ui-field__label" htmlFor={`role-${member.id}`}>
          Role
        </label>
        <select
          id={`role-${member.id}`}
          name="role"
          className="ui-field__input"
          defaultValue={member.role}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          disabled={rolePending}
        >
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="viewer">viewer</option>
        </select>
      </form>
      {!isSelf ? (
        <form
          action={removeAction}
          className="specs-form--inline"
          onSubmit={(e) => {
            if (!window.confirm(`Remove ${member.email} from the workspace?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="memberId" value={member.id} />
          <button
            type="submit"
            className="specs-value-button"
            aria-label={`Remove ${member.email}`}
            disabled={removePending}
          >
            {removePending ? 'Removing…' : 'Remove'}
          </button>
        </form>
      ) : null}
      {isOwnerViewing && !isSelf ? (
        <form
          action={transferAction}
          className="specs-form--inline"
          onSubmit={(e) => {
            if (
              !window.confirm(
                `Transfer ownership to ${member.email}? You become an admin — this can only be undone by the new owner.`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="newOwnerUserId" value={member.user_id} />
          <button
            type="submit"
            className="specs-value-button"
            aria-label={`Transfer ownership to ${member.email}`}
            disabled={transferPending}
          >
            {transferPending ? 'Transferring…' : 'Make owner'}
          </button>
        </form>
      ) : null}
      {roleState.error ?? removeState.error ?? transferState.error ? (
        <span className="ui-field__error">
          {roleState.error ?? removeState.error ?? transferState.error}
        </span>
      ) : null}
    </span>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    inviteMemberAction,
    {},
  );
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <TextField
        id="invite-email"
        name="email"
        label="Invite by email"
        placeholder="colleague@company.com"
        error={state.error}
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="invite-role">
          Role
        </label>
        <select id="invite-role" name="role" className="ui-field__input" defaultValue="member">
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Inviting…' : 'Invite'}
      </Button>
      {state.inviteUrl ? (
        <p className="specs-grid__meta">
          Invitation created — share this link (expires in 7 days):{' '}
          <code className="specs-invite-link">{state.inviteUrl}</code>
        </p>
      ) : null}
    </form>
  );
}

/**
 * F8.7 Danger Zone — owner-only soft delete. The typed slug must match before
 * the submit enables, so deletion is a deliberate two-step (the server re-checks
 * both the slug and owner role). Recovery is a 14-day grace + restore.
 */
export function DeleteWorkspaceForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    requestWorkspaceDeletionAction,
    {},
  );
  const [confirm, setConfirm] = useState('');
  const matches = confirm.trim().toLowerCase() === slug.toLowerCase();
  return (
    <form
      action={action}
      className="specs-form"
      noValidate
      onSubmit={(e) => {
        if (
          !window.confirm(
            'Delete this workspace? It is hidden immediately and permanently removed after a 14-day grace period. You can restore it until then.',
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <TextField
        id="confirm-slug"
        name="confirmSlug"
        label={`Type ${slug} to confirm`}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={state.error}
        autoComplete="off"
      />
      <Button type="submit" size="sm" variant="danger" disabled={pending || !matches}>
        {pending ? 'Scheduling…' : 'Delete workspace'}
      </Button>
    </form>
  );
}

/**
 * Shown when the active workspace is pending deletion — the only window in which
 * the owner can restore it. Non-owners see the countdown without the control.
 */
export function RestoreWorkspaceBanner({
  workspaceId,
  name,
  purgeAfter,
  canRestore,
}: {
  workspaceId: string;
  name: string;
  purgeAfter: string;
  canRestore: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    cancelWorkspaceDeletionAction,
    {},
  );
  const when = new Date(purgeAfter).toLocaleString();
  return (
    <section className="specs-section" role="alert">
      <h2 className="specs-section__title">Workspace scheduled for deletion</h2>
      <p>
        <strong>{name}</strong> is hidden and will be permanently removed on {when}.
      </p>
      {canRestore ? (
        <form action={action} className="specs-form--inline">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Restoring…' : 'Restore workspace'}
          </Button>
          {state.error ? <span className="ui-field__error">{state.error}</span> : null}
        </form>
      ) : (
        <p className="specs-grid__meta">Only the workspace owner can restore it.</p>
      )}
    </section>
  );
}

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    revokeInvitationAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Revoke the invitation for ${email}`}
        disabled={pending}
      >
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

export type { InvitationRow };
