'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCanDo } from '@arther/authz';
import {
  createServiceClient,
  DbRuleError,
  dispatchNotification,
  getActiveWorkspace,
  getDocument,
  membershipLookupFor,
  overrideApproval,
  recordApproval,
} from '@arther/db';
import {
  overrideApprovalSchema,
  recordApprovalSchema,
  type ApprovalRoleId,
  type DocumentId,
  type DocumentRevisionId,
  type UserId,
  type WorkspaceId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

/**
 * C3.5 — notify the document owner of an approval outcome (spec §9.2): a reached
 * Approved state, or a Send-back to Draft. Best-effort; the owner never equals the
 * actor (an owner can't review their own doc, and an owner override notifies no
 * one). Service-role dispatch (notifications have no authenticated INSERT).
 */
async function notifyApprovalOutcome(
  supabase: SupabaseClient,
  workspaceId: WorkspaceId,
  documentId: string,
  state: string,
  action: string,
  actorId: string,
): Promise<void> {
  const eventType =
    state === 'approved'
      ? ('document_approved' as const)
      : action === 'rejected'
        ? ('document_rejected' as const)
        : null;
  if (!eventType) return;
  try {
    const doc = await getDocument(supabase, documentId as DocumentId);
    if (!doc?.owner_id || doc.owner_id === actorId) return;
    await dispatchNotification(createServiceClient(), {
      workspaceId,
      recipientIds: [doc.owner_id],
      eventType,
      payload: { documentId, documentTitle: doc.title },
    });
  } catch {
    // ignore — notifications are best-effort
  }
}

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
    await notifyApprovalOutcome(supabase, workspace.id, documentId, state, parsed.data.action, user.id);
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

/**
 * C1.5 — the document owner (or a workspace admin) overrides a role's approval
 * with a mandatory reason. Seat-gated here (`doc.submit`); the `override_approval`
 * RPC enforces owner/admin and writes the flagged audit_log entry.
 */
export async function overrideApprovalAction(
  documentId: string,
  revisionId: string,
  input: unknown,
): Promise<ApprovalResult> {
  if (!UUID_RE.test(documentId) || !UUID_RE.test(revisionId)) {
    return { ok: false, error: 'Invalid document.' };
  }
  const parsed = overrideApprovalSchema.safeParse(input);
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
  if (!(await canDo({ id: user.id as UserId }, 'doc.submit', { workspaceId: workspace.id }))) {
    return { ok: false, error: 'You can’t override approvals.' };
  }

  try {
    const state = await overrideApproval(supabase, {
      revisionId: revisionId as DocumentRevisionId,
      roleId: parsed.data.roleId as ApprovalRoleId,
      reason: parsed.data.reason,
    });
    // An override can only complete approval (never rejects); 'override' isn't a reject.
    await notifyApprovalOutcome(supabase, workspace.id, documentId, state, 'override', user.id);
    revalidatePath(`/documents/${documentId}`);
    revalidatePath(`/documents/${documentId}/edit`);
    return { ok: true, state };
  } catch (err) {
    if (err instanceof DbRuleError) return { ok: false, error: err.message };
    return { ok: false, error: 'Could not override the approval.' };
  }
}
