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
  | 'doc.publish'
  | 'comment.write'
  | 'workspace.manage'
  | 'workspace.delete'
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

export function createCanDo(membership: MembershipLookup) {
  return async function canDo(user: AuthUser, action: Action, resource: Resource): Promise<boolean> {
    const m = await membership(user.id, resource.workspaceId); // null ⇒ not a member ⇒ deny
    if (!m) return false;
    switch (action) {
      case 'workspace.manage':
      case 'member.invite':
        return m.role === 'owner' || m.role === 'admin';
      case 'spec.write':
      case 'doc.write':
      case 'doc.generate':
      case 'doc.publish':
        return m.role !== 'viewer'; // Editor seats only
      case 'spec.read':
      case 'doc.read':
      case 'comment.write':
        return true; // any member, incl. viewer (commenting is a viewer right)
      case 'workspace.delete':
        return m.role === 'owner';
      default:
        return m.role === 'owner'; // closed by default
    }
  };
}

export type CanDo = ReturnType<typeof createCanDo>;
