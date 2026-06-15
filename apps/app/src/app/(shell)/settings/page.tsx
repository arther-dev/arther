import Link from 'next/link';
import {
  getActiveWorkspace,
  getPendingWorkspaceDeletion,
  listInvitations,
  listMembers,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';
import {
  DeleteWorkspaceForm,
  InviteForm,
  MemberControls,
  RenameWorkspaceForm,
  RestoreWorkspaceBanner,
  RevokeInvitationButton,
} from './SettingsForms';

/**
 * Workspace Settings (F4.5): name (editable, owner/admin) · immutable slug ·
 * members with role/remove/transfer (F4.2/F4.4) · invitations with accept
 * links + revoke (F4.3). The owner-only Danger Zone (F8.7) soft-deletes the
 * workspace (14-day grace + restore). No rail — Settings is one of the rail-less
 * modes (Handoff 02 region matrix). Logo upload follows with Storage.
 */
export default async function SettingsPage() {
  const supabase = await getSupabaseServer();

  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Workspace settings"
          description="Name, members, roles, and invitations live here once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace || !user) {
    // A soft-deleted workspace is RLS-hidden, so getActiveWorkspace returns null
    // even for its owner — the restore window (F8.7) is the one place it resurfaces.
    const pending = user ? await getPendingWorkspaceDeletion(supabase) : null;
    if (pending) {
      return (
        <AppShell>
          <div className="specs-content">
            <h1 className="specs-title">Workspace settings</h1>
            <RestoreWorkspaceBanner
              workspaceId={pending.id}
              name={pending.name}
              purgeAfter={pending.purge_after}
              canRestore={pending.role === 'owner'}
            />
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell>
        <EmptyState
          title="Create your workspace first"
          description="Settings live inside a workspace — set yours up and come back."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const [members, invitations] = await Promise.all([
    listMembers(supabase, workspace.id),
    canManage ? listInvitations(supabase, workspace.id) : Promise.resolve([]),
  ]);
  const pending = invitations.filter(
    (i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date(),
  );

  return (
    <AppShell>
      <div className="specs-content">
        <h1 className="specs-title">Workspace settings</h1>

        <section className="specs-section">
          <h2 className="specs-section__title">Workspace</h2>
          {canManage ? (
            <RenameWorkspaceForm currentName={workspace.name} />
          ) : (
            <p>{workspace.name}</p>
          )}
          <p className="specs-grid__meta">
            Portal address: <code>{workspace.slug}</code> — the slug is permanent (portal
            subdomain).
          </p>
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Members</h2>
          <table className="specs-grid">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Email</th>
                <th scope="col">Joined</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name ?? m.email}
                    {m.user_id === user.id ? <span className="specs-grid__meta"> (you)</span> : null}
                  </td>
                  <td className="specs-grid__meta">{m.email}</td>
                  <td className="specs-grid__meta">{new Date(m.joined_at).toLocaleDateString()}</td>
                  <td>
                    <MemberControls
                      member={m}
                      isSelf={m.user_id === user.id}
                      canManage={canManage}
                      isOwnerViewing={workspace.role === 'owner'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {canManage ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Document types</h2>
            <p className="specs-grid__meta">
              Generation schemas — what each kind of document contains and which spec data feeds it.
            </p>
            <Link className="ui-btn ui-btn--secondary ui-btn--sm" href="/settings/document-types">
              Configure document types
            </Link>
          </section>
        ) : null}

        {canManage ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Invitations</h2>
            {pending.length > 0 ? (
              <ul className="specs-form" aria-label="Pending invitations">
                {pending.map((i) => (
                  <li key={i.id} className="specs-release">
                    {i.email}
                    <span className="specs-release__tag">{i.role}</span>
                    <span className="specs-grid__meta">
                      expires {new Date(i.expires_at).toLocaleDateString()}
                    </span>
                    <RevokeInvitationButton invitationId={i.id} email={i.email} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="specs-grid__meta">No pending invitations.</p>
            )}
            <InviteForm />
          </section>
        ) : null}

        {workspace.role === 'owner' ? (
          <section className="specs-section">
            <h2 className="specs-section__title">Danger zone</h2>
            <p className="specs-grid__meta">
              Deleting hides the workspace immediately and permanently removes it — every
              product, document, and published portal — after a 14-day grace period. You can
              restore it from here until then.
            </p>
            <DeleteWorkspaceForm slug={workspace.slug} />
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
