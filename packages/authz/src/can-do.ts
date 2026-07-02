import type { UserId, WorkspaceId, WorkspaceRole } from '@arther/types';

/**
 * The single authorization authority (guardrail 1, ADR-010, Phase 1 F3.1).
 * Every mutation in apps and jobs routes through canDo(); RLS is the
 * defence-in-depth layer behind it, never the only check and never bypassed
 * by feature code deciding permissions inline.
 *
 * Action strings follow `<domain>.<verb>`. The list grows with the phases;
 * unknown actions are owner-only (closed by default).
 */
export type Action =
  | 'spec.read'
  | 'spec.write'
  | 'doc.read'
  | 'doc.write'
  | 'doc.generate'
  | 'doc.submit'
  | 'doc.revise'
  | 'doc.publish'
  | 'doc.approve'
  | 'comment.write'
  | 'workspace.manage'
  | 'workspace.delete'
  | 'workspace.transfer'
  | 'member.invite'
  | (string & {});

export interface AuthUser {
  id: UserId;
}

export interface Resource {
  workspaceId: WorkspaceId;
}

export interface Membership {
  role: WorkspaceRole;
}

/**
 * Membership lookup is injected so canDo stays pure and unit-testable, and so
 * apps (user-JWT client) and jobs (service client) can each supply their own
 * data path without this module knowing about either.
 */
export type MembershipLookup = (
  userId: UserId,
  workspaceId: WorkspaceId,
) => Promise<Membership | null>;

/**
 * The decision table itself — the one place a role is mapped to a permission.
 * Surfaces that already hold the caller's role (getActiveWorkspace returns it)
 * use this directly for render gating and re-checks instead of re-encoding the
 * rules inline; canDo() is the same table behind a membership lookup.
 */
export function roleAllows(role: WorkspaceRole, action: Action): boolean {
  switch (action) {
    case 'workspace.manage':
    case 'member.invite':
      return role === 'owner' || role === 'admin';
    case 'spec.write':
    case 'doc.write':
    case 'doc.generate':
    case 'doc.submit': // drive document lifecycle (send for review / pull back)
    case 'doc.revise': // fork a new working copy from a published snapshot
    case 'doc.publish':
      return role !== 'viewer'; // Editor seats only
    case 'spec.read':
    case 'doc.read':
    case 'comment.write':
    case 'doc.approve': // approving/rejecting is a spec'd viewer right (billing spec)
      return true; // any member, incl. viewer
    case 'workspace.delete':
    case 'workspace.transfer':
      return role === 'owner';
    default:
      return role === 'owner'; // closed by default
  }
}

export function createCanDo(membership: MembershipLookup) {
  return async function canDo(user: AuthUser, action: Action, resource: Resource): Promise<boolean> {
    const m = await membership(user.id, resource.workspaceId); // null ⇒ not a member ⇒ deny
    if (!m) return false;
    return roleAllows(m.role, action);
  };
}

export type CanDo = ReturnType<typeof createCanDo>;
