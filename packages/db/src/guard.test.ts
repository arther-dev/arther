import { describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@arther/types';
import { MissingWorkspaceScopeError, scopedServiceQuery } from './guard';

const WS = '0d4ee021-92eb-44a5-a1a4-6b04f7e3e159' as WorkspaceId;

describe('scopedServiceQuery', () => {
  it('runs the operation with the validated scope', async () => {
    const result = await scopedServiceQuery({ workspaceId: WS }, async (scope) => scope.workspaceId);
    expect(result).toBe(WS);
  });

  it('rejects a missing scope object', async () => {
    await expect(
      scopedServiceQuery(undefined as never, async () => 'never'),
    ).rejects.toBeInstanceOf(MissingWorkspaceScopeError);
  });

  it('rejects an empty workspaceId', async () => {
    await expect(
      scopedServiceQuery({ workspaceId: '' as WorkspaceId }, async () => 'never'),
    ).rejects.toBeInstanceOf(MissingWorkspaceScopeError);
  });

  it('rejects a non-UUID workspaceId (e.g. an accidental slug)', async () => {
    await expect(
      scopedServiceQuery({ workspaceId: 'acme' as WorkspaceId }, async () => 'never'),
    ).rejects.toThrow(/not a UUID/);
  });

  it('never invokes the operation when the guard fails', async () => {
    let ran = false;
    await scopedServiceQuery({ workspaceId: 'nope' as WorkspaceId }, async () => {
      ran = true;
    }).catch(() => undefined);
    expect(ran).toBe(false);
  });
});
