import { describe, expect, it } from 'vitest';
import type { UserId, WorkspaceId, WorkspaceRole } from '@arther/types';
import { createCanDo, type Action } from './can-do';

const USER = { id: 'user' as unknown as UserId };
const WS = { workspaceId: 'ws' as unknown as WorkspaceId };

function canDoAs(role: WorkspaceRole | null) {
  return createCanDo(async () => (role ? { role } : null));
}

describe('canDo', () => {
  it('denies non-members everything', async () => {
    const canDo = canDoAs(null);
    for (const action of ['spec.read', 'spec.write', 'workspace.manage', 'anything.else']) {
      expect(await canDo(USER, action, WS)).toBe(false);
    }
  });

  // Full role × action matrix (F3 acceptance: a Viewer is denied spec.write).
  const matrix: Array<[Action, Record<WorkspaceRole, boolean>]> = [
    ['workspace.manage', { owner: true, admin: true, member: false, viewer: false }],
    ['member.invite', { owner: true, admin: true, member: false, viewer: false }],
    ['spec.write', { owner: true, admin: true, member: true, viewer: false }],
    ['doc.generate', { owner: true, admin: true, member: true, viewer: false }],
    ['doc.publish', { owner: true, admin: true, member: true, viewer: false }],
    ['spec.read', { owner: true, admin: true, member: true, viewer: true }],
    ['doc.read', { owner: true, admin: true, member: true, viewer: true }],
    ['comment.write', { owner: true, admin: true, member: true, viewer: true }],
    ['workspace.delete', { owner: true, admin: false, member: false, viewer: false }],
  ];

  for (const [action, expected] of matrix) {
    it(`routes "${action}" correctly per role`, async () => {
      for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
        expect(await canDoAs(role)(USER, action, WS), `${role} → ${action}`).toBe(expected[role]);
      }
    });
  }

  it('is closed by default: unknown actions are owner-only', async () => {
    expect(await canDoAs('owner')(USER, 'future.action', WS)).toBe(true);
    for (const role of ['admin', 'member', 'viewer'] as const) {
      expect(await canDoAs(role)(USER, 'future.action', WS)).toBe(false);
    }
  });
});
