import type { SupabaseClient } from '@supabase/supabase-js';
import { roleAllows, type Action } from '@arther/authz';
import { getActiveWorkspace, type ActiveWorkspace } from '@arther/db';
import type { UserId } from '@arther/types';
import { getSupabaseServer } from './supabase/server';

export interface AuthorizedContext {
  supabase: SupabaseClient;
  userId: UserId;
  workspace: ActiveWorkspace;
}

/**
 * The one authorization preamble every server action shares (guardrail 1, F3):
 * provisioned client → signed-in user → active workspace → permission check.
 * getActiveWorkspace already returns the caller's membership role, so the
 * check is roleAllows() — the canDo decision table — with no second
 * workspace_members round trip. RLS stays active behind it (defence in depth).
 */
export async function authorizeAction(
  action: Action,
  denied: string,
): Promise<AuthorizedContext | { error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' };
  if (!roleAllows(workspace.role, action)) return { error: denied };
  return { supabase, userId: user.id as UserId, workspace };
}
