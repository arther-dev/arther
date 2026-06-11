import type { WorkspaceId } from '@arther/types';

/**
 * Service-role queries bypass RLS, so tenancy must be carried explicitly:
 * every service-role data path MUST be scoped to a workspace (Phase 1 F1.6,
 * ADR-010). This runtime guard is the enforcement point until the type-aware
 * lint rule lands (see eslint.config.mjs note).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MissingWorkspaceScopeError extends Error {
  constructor(detail: string) {
    super(
      `Service-role query without a workspace scope: ${detail}. ` +
        `Every service-role data path must pass { workspaceId } (guardrail 1 / F1.6).`,
    );
    this.name = 'MissingWorkspaceScopeError';
  }
}

export interface WorkspaceScope {
  workspaceId: WorkspaceId;
}

export function assertWorkspaceScope(scope: unknown): asserts scope is WorkspaceScope {
  if (typeof scope !== 'object' || scope === null) {
    throw new MissingWorkspaceScopeError('no scope object provided');
  }
  const workspaceId = (scope as { workspaceId?: unknown }).workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    throw new MissingWorkspaceScopeError('workspaceId is missing or empty');
  }
  if (!UUID_RE.test(workspaceId)) {
    throw new MissingWorkspaceScopeError(`workspaceId "${workspaceId}" is not a UUID`);
  }
}

/**
 * Wrap a service-role operation so it cannot run without a workspace scope.
 * The scope is handed to the operation so the workspace_id predicate is the
 * same value that passed the guard.
 */
export async function scopedServiceQuery<T>(
  scope: WorkspaceScope,
  operation: (scope: WorkspaceScope) => Promise<T>,
): Promise<T> {
  assertWorkspaceScope(scope);
  return operation(scope);
}
