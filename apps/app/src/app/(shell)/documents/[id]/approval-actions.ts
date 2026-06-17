'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import {
  DbRuleError,
  getActiveWorkspace,
  membershipLookupFor,
  recordApproval,
} from '@arther/db';
import {
  recordApprovalSchema,
  type ApprovalRoleId,
  type DocumentRevisionId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ApprovalResult {
  ok: boolean;
  error?: string;
  /** The document's resulting lifecycle state. */
  state?: string;
}

/**
 * C1.1/C1.2 — record an approver's Approve or Send-back on a document in Review.
 * `doc.approve` is a viewer-level seat right (billing spec); the deeper checks —
 * the caller is an assigned approver for the role, the document is in Review,
 * a reason accompanies a rejection — are enforced by the `record_approval` RPC
 * (migration 0019), which also advances the state machine atomically.
 */
export async function recordApprovalAction(
  documentId: string,
  revisionId: string,
  input: unknown,
): Promise<ApprovalResult> {
  if (!UUID_RE.test(documentId) || !UUID_RE.test(revisionId)) {
    return { ok: false, error: 'Invalid document.' };
  }
  const parsed = recordApprovalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { ok: false, error: 'No workspace yet.' };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.approve', { workspaceId: workspace.id }))) {
    return { ok: false, error: 'You can’t review documents in this workspace.' };
  }

  try {
    const state = await recordApproval(supabase, {
      revisionId: revisionId as DocumentRevisionId,
      roleId: parsed.data.roleId as ApprovalRoleId,
      action: parsed.data.action,
      reason: parsed.data.reason ?? null,
    });
    revalidatePath(`/documents/${documentId}`);
    revalidatePath(`/documents/${documentId}/edit`);
    return { ok: true, state };
  } catch (err) {
    // RPC rule violations (not an assigned approver, not in review, …) are
    // author-written and safe to show; anything else is generic.
    if (err instanceof DbRuleError) return { ok: false, error: err.message };
    return { ok: false, error: 'Could not record your review.' };
  }
}
