'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo, type Action } from '@arther/authz';
import {
  createDocumentRevision,
  getActiveWorkspace,
  getDocument,
  getRevision,
  listApprovalRoles,
  membershipLookupFor,
  transitionDocumentRevision,
} from '@arther/db';
import {
  canManageDocumentLifecycle,
  resolveTransition,
  submitForReviewSchema,
  type DocumentId,
  type DocumentRevisionId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LifecycleResult {
  ok: boolean;
  error?: string;
  /** The document's new lifecycle state on success. */
  state?: string;
}

/** The owner-driven actions this slice wires, each mapped to its canDo gate. */
type OwnerAction =
  | 'submit_for_review'
  | 'pull_back_to_draft'
  | 'pull_back_to_review'
  | 'publish'
  | 'create_revision';

const ACTION_AUTHZ: Record<OwnerAction, Action> = {
  submit_for_review: 'doc.submit',
  pull_back_to_draft: 'doc.submit',
  pull_back_to_review: 'doc.submit',
  publish: 'doc.publish',
  create_revision: 'doc.revise',
};

/**
 * Authorize a lifecycle action: signed in + a workspace + the canDo seat gate +
 * document ownership (the document owner or a workspace admin — spec §4.3). The
 * guarded conditional UPDATE and RLS sit behind this as defence in depth.
 */
async function authorize(documentId: string, action: OwnerAction) {
  if (!UUID_RE.test(documentId)) return { error: 'Invalid document.' as const };
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet.' as const };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, ACTION_AUTHZ[action], { workspaceId: workspace.id }))) {
    return { error: 'Viewers can’t change a document’s status.' as const };
  }

  const document = await getDocument(supabase, documentId as DocumentId);
  if (!document || !document.current_revision_id) return { error: 'Document not found.' as const };
  if (
    !canManageDocumentLifecycle({
      documentOwnerId: document.owner_id,
      userId: user.id,
      role: workspace.role,
    })
  ) {
    return { error: 'Only the document owner or a workspace admin can change its status.' as const };
  }

  return { supabase, userId: user.id as UserId, workspaceId: workspace.id, document };
}

function revalidateDocument(documentId: string) {
  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/documents/${documentId}/edit`);
}

async function runOwnerTransition(
  documentId: string,
  action: Exclude<OwnerAction, 'create_revision'>,
  meta?: { reviewBrief?: string; reviewDueDate?: string },
): Promise<LifecycleResult> {
  const auth = await authorize(documentId, action);
  if ('error' in auth) return { ok: false, error: auth.error };

  const revision = await getRevision(
    auth.supabase,
    auth.document.current_revision_id as DocumentRevisionId,
  );
  if (!revision) return { ok: false, error: 'Document not found.' };
  const transition = resolveTransition(action, revision.state);
  if (!transition) {
    return { ok: false, error: `Can’t do that from “${revision.state}”.` };
  }

  // C1 (spec §4.2) — a document can't enter Review while a required approval
  // role is vacant: there would be no one able to approve it.
  if (action === 'submit_for_review') {
    const roles = await listApprovalRoles(auth.supabase, auth.document.document_type_id);
    const vacant = roles.filter((r) => r.required && r.assignments.length === 0);
    if (vacant.length > 0) {
      return {
        ok: false,
        error: `Assign an approver to ${vacant
          .map((r) => r.role_label)
          .join(', ')} before sending for review.`,
      };
    }
  }

  try {
    const outcome = await transitionDocumentRevision(auth.supabase, {
      revisionId: revision.id,
      from: revision.state,
      action,
      userId: auth.userId,
      reviewBrief: meta?.reviewBrief ?? null,
      reviewDueDate: meta?.reviewDueDate ?? null,
      // Entering Review starts a fresh approval cycle (resets prior approvals).
      reviewCycle: transition.to === 'review' ? revision.review_cycle + 1 : undefined,
    });
    if (outcome.status === 'conflict') {
      return { ok: false, error: 'The document’s status changed elsewhere — reload and try again.' };
    }
    revalidateDocument(documentId);
    return { ok: true, state: outcome.state };
  } catch {
    return { ok: false, error: 'Could not update the document’s status.' };
  }
}

/** Draft → Review, with the optional review brief + due date (spec §5.1; C0.4). */
export async function submitForReviewAction(
  documentId: string,
  input: unknown,
): Promise<LifecycleResult> {
  const parsed = submitForReviewSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  return runOwnerTransition(documentId, 'submit_for_review', {
    reviewBrief: parsed.data.reviewBrief || undefined,
    reviewDueDate: parsed.data.reviewDueDate || undefined,
  });
}

/** Review → Draft or Approved → Draft (owner pull-back; spec §3.2). */
export async function pullBackToDraftAction(documentId: string): Promise<LifecycleResult> {
  return runOwnerTransition(documentId, 'pull_back_to_draft');
}

/** Approved → Review (owner pull-back; the document re-locks). */
export async function pullBackToReviewAction(documentId: string): Promise<LifecycleResult> {
  return runOwnerTransition(documentId, 'pull_back_to_review');
}

/**
 * Approved → Published. C0 flips the lifecycle state and stamps the publish
 * metadata; the snapshot resolver + immutable `published_snapshots` write (and
 * the pre-flight gate) land in C4 — wired into this transition there.
 */
export async function publishDocumentAction(documentId: string): Promise<LifecycleResult> {
  return runOwnerTransition(documentId, 'publish');
}

/** Published → Draft: fork a new working copy from the published snapshot (C0.2). */
export async function createRevisionAction(documentId: string): Promise<LifecycleResult> {
  const auth = await authorize(documentId, 'create_revision');
  if ('error' in auth) return { ok: false, error: auth.error };

  const revision = await getRevision(
    auth.supabase,
    auth.document.current_revision_id as DocumentRevisionId,
  );
  if (!revision) return { ok: false, error: 'Document not found.' };
  if (revision.state !== 'published') {
    return { ok: false, error: 'Only a published document can start a new revision.' };
  }

  try {
    await createDocumentRevision(auth.supabase, {
      workspaceId: auth.workspaceId,
      documentId: documentId as DocumentId,
      fromRevisionId: revision.id,
      userId: auth.userId,
    });
    revalidateDocument(documentId);
    return { ok: true, state: 'draft' };
  } catch {
    return { ok: false, error: 'Could not create a new revision.' };
  }
}
