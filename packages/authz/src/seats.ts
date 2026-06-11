import type { SeatTier, WorkspaceRole } from '@arther/types';

/**
 * Seat tier is DERIVED from role, never stored independently (Phase 1 F3.2,
 * billing spec): Owner/Admin/Member occupy paid Editor seats; Viewer is free.
 * Role changes are seat changes — workspace_members.updated_at is the
 * role→seat transition timestamp the deferred billing UI will read.
 */
export function seatForRole(role: WorkspaceRole): SeatTier {
  return role === 'viewer' ? 'viewer' : 'editor';
}

export function countSeats(roles: readonly WorkspaceRole[]): { editor: number; viewer: number } {
  let editor = 0;
  let viewer = 0;
  for (const role of roles) {
    if (seatForRole(role) === 'editor') editor += 1;
    else viewer += 1;
  }
  return { editor, viewer };
}
