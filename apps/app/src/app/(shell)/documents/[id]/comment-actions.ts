'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import {
  addCommentReply,
  createCommentThread,
  getActiveWorkspace,
  getCommentThreadMeta,
  getDocument,
  membershipLookupFor,
  reopenCommentThread,
  resolveCommentThread,
} from '@arther/db';
import {
  canManageDocumentLifecycle,
  canResolveThread,
  commentBodySchema,
  type DocumentId,
  type DocumentRevisionId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

/**
 * C2 — comment actions. Posting/replying is a spec'd member right
 * (`comment.write`, viewers included); resolving/reopening follows the §7.4 rule
 * (author · owner/admin · approver) via the pure `canResolveThread`. RLS is the
 * defence-in-depth layer behind these checks. Approver-resolve is wired with the
 * approver context in a follow-up; for now owner/admin + the author may resolve.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CommentActionResult {
  ok: boolean;
  error?: string;
}

async function ctx(documentId: string) {
  if (!UUID_RE.test(documentId)) return { error: 'Invalid document.' as const };
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet.' as const };
  const document = await getDocument(supabase, documentId as DocumentId);
  if (!document || !document.current_revision_id) return { error: 'Document not found.' as const };
  return { supabase, user, workspace, document };
}

function revalidate(documentId: string) {
  revalidatePath(`/documents/${documentId}`);
}

/** C2.1 — start a block-anchored thread with its first comment (any member). */
export async function addCommentAction(
  documentId: string,
  input: { blockId: string; body: string },
): Promise<CommentActionResult> {
  const c = await ctx(documentId);
  if ('error' in c) return { ok: false, error: c.error };
  if (!UUID_RE.test(input.blockId)) return { ok: false, error: 'Pick a block to comment on.' };
  const parsed = commentBodySchema.safeParse(input.body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Write a comment.' };

  const canDo = createCanDo(membershipLookupFor(c.supabase));
  if (!(await canDo({ id: c.user.id as UserId }, 'comment.write', { workspaceId: c.workspace.id }))) {
    return { ok: false, error: 'You don’t have access to comment.' };
  }

  try {
    await createCommentThread(c.supabase, {
      workspaceId: c.workspace.id,
      revisionId: c.document.current_revision_id as DocumentRevisionId,
      blockId: input.blockId,
      anchorType: 'block',
      authorId: c.user.id as UserId,
      body: parsed.data,
    });
    revalidate(documentId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not post the comment.' };
  }
}

/** C2.1 — reply to a thread, one level deep (any member). */
export async function replyToThreadAction(
  documentId: string,
  input: { threadId: string; body: string },
): Promise<CommentActionResult> {
  const c = await ctx(documentId);
  if ('error' in c) return { ok: false, error: c.error };
  if (!UUID_RE.test(input.threadId)) return { ok: false, error: 'Unknown thread.' };
  const parsed = commentBodySchema.safeParse(input.body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Write a reply.' };

  const canDo = createCanDo(membershipLookupFor(c.supabase));
  if (!(await canDo({ id: c.user.id as UserId }, 'comment.write', { workspaceId: c.workspace.id }))) {
    return { ok: false, error: 'You don’t have access to comment.' };
  }

  try {
    await addCommentReply(c.supabase, {
      workspaceId: c.workspace.id,
      threadId: input.threadId,
      authorId: c.user.id as UserId,
      body: parsed.data,
    });
    revalidate(documentId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not post the reply.' };
  }
}

/** C2.2 — resolve a thread (§7.4: author · owner/admin · approver). */
export async function resolveThreadAction(
  documentId: string,
  threadId: string,
): Promise<CommentActionResult> {
  return setThreadResolved(documentId, threadId, true);
}

/** C2.2 — reopen a resolved thread (same §7.4 gate as resolve). */
export async function reopenThreadAction(
  documentId: string,
  threadId: string,
): Promise<CommentActionResult> {
  return setThreadResolved(documentId, threadId, false);
}

async function setThreadResolved(
  documentId: string,
  threadId: string,
  resolved: boolean,
): Promise<CommentActionResult> {
  const c = await ctx(documentId);
  if ('error' in c) return { ok: false, error: c.error };
  if (!UUID_RE.test(threadId)) return { ok: false, error: 'Unknown thread.' };

  const meta = await getCommentThreadMeta(c.supabase, threadId);
  if (!meta) return { ok: false, error: 'Thread not found.' };

  const isOwner = canManageDocumentLifecycle({
    documentOwnerId: c.document.owner_id,
    userId: c.user.id,
    role: c.workspace.role,
  });
  if (
    !canResolveThread({
      userId: c.user.id,
      threadCreatedBy: meta.createdBy,
      isOwner,
      isApprover: false,
    })
  ) {
    return {
      ok: false,
      error: 'Only the thread author, document owner, or an approver can resolve this.',
    };
  }

  try {
    if (resolved) await resolveCommentThread(c.supabase, { threadId, userId: c.user.id as UserId });
    else await reopenCommentThread(c.supabase, threadId);
    revalidate(documentId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update the thread.' };
  }
}
