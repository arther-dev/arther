import type { SupabaseClient } from '@supabase/supabase-js';
import { isTextAnchorValid } from '@arther/types';
import type {
  CommentAnchorType,
  CommentThreadStatus,
  DocumentRevisionId,
  TextAnchor,
  UserId,
  WorkspaceId,
} from '@arther/types';

/** Read a stored `text_anchor` jsonb (snake_case) into a `TextAnchor`, or null. */
function readTextAnchor(raw: unknown): TextAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as { start_offset?: unknown; end_offset?: unknown; anchor_text?: unknown };
  if (typeof a.start_offset !== 'number' || typeof a.end_offset !== 'number' || typeof a.anchor_text !== 'string') {
    return null;
  }
  return { startOffset: a.start_offset, endOffset: a.end_offset, anchorText: a.anchor_text };
}

/**
 * C2 — block-anchored comment threads (collaboration spec §7; schema in 0007).
 * Threads are revision-scoped and anchored to a block; a thread is a root comment
 * plus replies nested one level deep (§7.4). Commenting is a spec'd VIEWER right,
 * so the RLS is member-level (not editor); the "who can resolve" rule (§7.4) is
 * enforced in the app action via the pure `canResolveThread`. All reads/writes run
 * under the caller's JWT.
 */

export interface CommentView {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  parentCommentId: string | null;
  createdAt: string;
  editedAt: string | null;
}

export interface CommentThreadView {
  id: string;
  blockId: string | null;
  anchorType: CommentAnchorType;
  /** C2.1 — the anchored span for a `text_range` thread; null for block-level. */
  textAnchor: TextAnchor | null;
  status: CommentThreadStatus;
  createdBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** C2.4 — the source thread when this was carried forward; null = native. */
  inheritedFromThreadId: string | null;
  comments: CommentView[];
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** C2.1 — start a thread on a block with its first comment. */
export async function createCommentThread(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    revisionId: DocumentRevisionId;
    blockId: string;
    anchorType: CommentAnchorType;
    textAnchor?: TextAnchor;
    authorId: UserId;
    body: string;
  },
): Promise<{ threadId: string; commentId: string }> {
  const { data: thread, error } = await client
    .from('comment_threads')
    .insert({
      workspace_id: input.workspaceId,
      revision_id: input.revisionId,
      block_id: input.blockId,
      anchor_type: input.anchorType,
      text_anchor: input.textAnchor
        ? {
            start_offset: input.textAnchor.startOffset,
            end_offset: input.textAnchor.endOffset,
            anchor_text: input.textAnchor.anchorText,
          }
        : null,
      created_by: input.authorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createCommentThread.thread: ${error.message}`);

  const threadId = thread.id as string;
  const { data: comment, error: cErr } = await client
    .from('comments')
    .insert({
      workspace_id: input.workspaceId,
      thread_id: threadId,
      author_id: input.authorId,
      body: input.body,
    })
    .select('id')
    .single();
  if (cErr) {
    // Roll back the empty thread so a failed first comment leaves no orphan.
    await client.from('comment_threads').delete().eq('id', threadId);
    throw new Error(`createCommentThread.comment: ${cErr.message}`);
  }
  return { threadId, commentId: comment.id as string };
}

/** C2.1 — reply to a thread (one level deep: the reply hangs off the root comment). */
export async function addCommentReply(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; threadId: string; authorId: UserId; body: string },
): Promise<{ commentId: string }> {
  const { data: root, error: rootErr } = await client
    .from('comments')
    .select('id')
    .eq('thread_id', input.threadId)
    .is('parent_comment_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (rootErr) throw new Error(`addCommentReply.root: ${rootErr.message}`);
  if (!root) throw new Error('addCommentReply: thread has no root comment.');

  const { data, error } = await client
    .from('comments')
    .insert({
      workspace_id: input.workspaceId,
      thread_id: input.threadId,
      parent_comment_id: root.id as string,
      author_id: input.authorId,
      body: input.body,
    })
    .select('id')
    .single();
  if (error) throw new Error(`addCommentReply: ${error.message}`);
  return { commentId: data.id as string };
}

export interface CommentThreadMeta {
  workspaceId: WorkspaceId;
  revisionId: DocumentRevisionId;
  createdBy: string | null;
  status: CommentThreadStatus;
}

/** Thread fields needed to authorize resolve/reopen (the §7.4 rule runs in the app). */
export async function getCommentThreadMeta(
  client: SupabaseClient,
  threadId: string,
): Promise<CommentThreadMeta | null> {
  const { data, error } = await client
    .from('comment_threads')
    .select('workspace_id, revision_id, created_by, status')
    .eq('id', threadId)
    .maybeSingle();
  if (error) throw new Error(`getCommentThreadMeta: ${error.message}`);
  if (!data) return null;
  return {
    workspaceId: data.workspace_id as WorkspaceId,
    revisionId: data.revision_id as DocumentRevisionId,
    createdBy: (data.created_by as string | null) ?? null,
    status: data.status as CommentThreadStatus,
  };
}

/** C2.2 — resolve a thread (collapses + records who/when). Open → resolved only. */
export async function resolveCommentThread(
  client: SupabaseClient,
  input: { threadId: string; userId: UserId },
): Promise<boolean> {
  const { data, error } = await client
    .from('comment_threads')
    .update({ status: 'resolved', resolved_by: input.userId, resolved_at: new Date().toISOString() })
    .eq('id', input.threadId)
    .eq('status', 'open')
    .select('id');
  if (error) throw new Error(`resolveCommentThread: ${error.message}`);
  return (data ?? []).length > 0;
}

/** C2.2 — reopen a resolved thread (clears the resolution). Resolved → open only. */
export async function reopenCommentThread(
  client: SupabaseClient,
  threadId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('comment_threads')
    .update({ status: 'open', resolved_by: null, resolved_at: null })
    .eq('id', threadId)
    .eq('status', 'resolved')
    .select('id');
  if (error) throw new Error(`reopenCommentThread: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * C2.3 — orphan a block's OPEN threads when its anchor is no longer valid
 * (collab spec §7.5): a regenerate replaces the block's prose (`block_regenerated`),
 * a delete removes the block entirely (reason `null` — the FK nulls `block_id`).
 * Only open threads orphan; resolved feedback was already addressed and keeps its
 * resolution. Orphaned threads are preserved, not deleted. Returns the count.
 */
export async function orphanBlockThreads(
  client: SupabaseClient,
  blockId: string,
  reason: 'block_regenerated' | null,
): Promise<number> {
  const { data, error } = await client
    .from('comment_threads')
    .update({ status: 'orphaned', orphaned_reason: reason })
    .eq('block_id', blockId)
    .eq('status', 'open')
    .select('id');
  if (error) throw new Error(`orphanBlockThreads: ${error.message}`);
  return (data ?? []).length;
}

/**
 * C2.3 (text_edited) — after a block's prose is edited, orphan its OPEN
 * text-range threads whose anchored span no longer matches the new text (collab
 * spec §7.5). Block-level threads are untouched — only text-range anchors orphan
 * on a text edit. Returns how many threads were orphaned.
 */
export async function orphanStaleTextAnchors(
  client: SupabaseClient,
  blockId: string,
  textContent: string | null,
): Promise<number> {
  const { data, error } = await client
    .from('comment_threads')
    .select('id, text_anchor')
    .eq('block_id', blockId)
    .eq('status', 'open')
    .eq('anchor_type', 'text_range');
  if (error) throw new Error(`orphanStaleTextAnchors: ${error.message}`);

  const stale: string[] = [];
  for (const row of (data ?? []) as Array<{ id: string; text_anchor: unknown }>) {
    const anchor = readTextAnchor(row.text_anchor);
    if (!anchor || !isTextAnchorValid(textContent, anchor)) stale.push(row.id);
  }
  if (stale.length === 0) return 0;

  const { error: ue } = await client
    .from('comment_threads')
    .update({ status: 'orphaned', orphaned_reason: 'text_edited' })
    .in('id', stale);
  if (ue) throw new Error(`orphanStaleTextAnchors.update: ${ue.message}`);
  return stale.length;
}

/** C2.1 — every thread for a revision (oldest first), each with its comments. */
export async function listCommentThreads(
  client: SupabaseClient,
  revisionId: DocumentRevisionId,
): Promise<CommentThreadView[]> {
  const { data: threads, error } = await client
    .from('comment_threads')
    .select(
      'id, block_id, anchor_type, text_anchor, status, created_by, created_at, resolved_at, inherited_from_thread_id',
    )
    .eq('revision_id', revisionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listCommentThreads: ${error.message}`);
  const threadRows = (threads ?? []) as Array<Record<string, unknown>>;
  if (threadRows.length === 0) return [];

  const ids = threadRows.map((t) => t.id as string);
  const { data: comments, error: cErr } = await client
    .from('comments')
    .select('id, thread_id, author_id, parent_comment_id, body, created_at, edited_at, author:author_id(name, email)')
    .in('thread_id', ids)
    .order('created_at', { ascending: true });
  if (cErr) throw new Error(`listCommentThreads.comments: ${cErr.message}`);

  const byThread = new Map<string, CommentView[]>();
  for (const row of (comments ?? []) as Array<Record<string, unknown>>) {
    const author = one(row.author as { name: string | null; email: string } | null);
    const view: CommentView = {
      id: row.id as string,
      authorId: (row.author_id as string | null) ?? null,
      authorName: author?.name ?? author?.email ?? 'Unknown',
      body: row.body as string,
      parentCommentId: (row.parent_comment_id as string | null) ?? null,
      createdAt: row.created_at as string,
      editedAt: (row.edited_at as string | null) ?? null,
    };
    const list = byThread.get(row.thread_id as string) ?? [];
    list.push(view);
    byThread.set(row.thread_id as string, list);
  }

  return threadRows.map((t) => ({
    id: t.id as string,
    blockId: (t.block_id as string | null) ?? null,
    anchorType: t.anchor_type as CommentAnchorType,
    textAnchor: readTextAnchor(t.text_anchor),
    status: t.status as CommentThreadStatus,
    createdBy: (t.created_by as string | null) ?? null,
    createdAt: t.created_at as string,
    resolvedAt: (t.resolved_at as string | null) ?? null,
    inheritedFromThreadId: (t.inherited_from_thread_id as string | null) ?? null,
    comments: byThread.get(t.id as string) ?? [],
  }));
}

/**
 * C2.4 — carry a revision's UNRESOLVED threads onto a freshly forked revision,
 * re-anchored to the corresponding (remapped) block and flagged inherited
 * (collab spec §7.3). Each thread's comments are copied too (root + one level
 * of replies), preserving authorship and timestamps so the discussion context
 * carries. Resolved and orphaned threads are left behind. Returns how many
 * threads were carried forward. Runs inside `createDocumentRevision` under the
 * forking owner's JWT (member-RLS).
 */
export async function carryForwardComments(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    fromRevisionId: DocumentRevisionId;
    toRevisionId: DocumentRevisionId;
    blockIdMap: Map<string, string>;
  },
): Promise<number> {
  const { data: threads, error } = await client
    .from('comment_threads')
    .select('id, block_id, anchor_type, text_anchor, created_by')
    .eq('revision_id', input.fromRevisionId)
    .eq('status', 'open');
  if (error) throw new Error(`carryForwardComments.threads: ${error.message}`);
  const sourceThreads = (threads ?? []) as Array<Record<string, unknown>>;
  if (sourceThreads.length === 0) return 0;

  const { data: comments, error: cErr } = await client
    .from('comments')
    .select('thread_id, parent_comment_id, author_id, body, created_at')
    .in('thread_id', sourceThreads.map((t) => t.id as string))
    .order('created_at', { ascending: true });
  if (cErr) throw new Error(`carryForwardComments.comments: ${cErr.message}`);
  const byThread = new Map<string, Array<Record<string, unknown>>>();
  for (const row of (comments ?? []) as Array<Record<string, unknown>>) {
    const list = byThread.get(row.thread_id as string) ?? [];
    list.push(row);
    byThread.set(row.thread_id as string, list);
  }

  let carried = 0;
  for (const t of sourceThreads) {
    const newBlockId = input.blockIdMap.get(t.block_id as string);
    if (!newBlockId) continue; // block absent in the fork (shouldn't happen) — skip

    const { data: nt, error: te } = await client
      .from('comment_threads')
      .insert({
        workspace_id: input.workspaceId,
        revision_id: input.toRevisionId,
        block_id: newBlockId,
        anchor_type: t.anchor_type,
        text_anchor: t.text_anchor ?? null,
        created_by: t.created_by,
        inherited_from_thread_id: t.id,
      })
      .select('id')
      .single();
    if (te) throw new Error(`carryForwardComments.thread: ${te.message}`);
    const newThreadId = nt.id as string;

    const threadComments = byThread.get(t.id as string) ?? [];
    const root = threadComments.find((c) => c.parent_comment_id == null);
    if (!root) {
      carried += 1;
      continue; // a thread with no root comment — copy the (empty) thread only
    }
    const { data: nr, error: re } = await client
      .from('comments')
      .insert({
        workspace_id: input.workspaceId,
        thread_id: newThreadId,
        parent_comment_id: null,
        author_id: root.author_id,
        body: root.body,
        created_at: root.created_at,
      })
      .select('id')
      .single();
    if (re) throw new Error(`carryForwardComments.root: ${re.message}`);

    const replies = threadComments.filter((c) => c.parent_comment_id != null);
    if (replies.length > 0) {
      const { error: rpe } = await client.from('comments').insert(
        replies.map((reply) => ({
          workspace_id: input.workspaceId,
          thread_id: newThreadId,
          parent_comment_id: nr.id as string,
          author_id: reply.author_id,
          body: reply.body,
          created_at: reply.created_at,
        })),
      );
      if (rpe) throw new Error(`carryForwardComments.replies: ${rpe.message}`);
    }
    carried += 1;
  }
  return carried;
}

/** C3.5 — distinct comment authors on a revision (recipients for `document_published`). */
export async function listRevisionCommenterIds(
  client: SupabaseClient,
  revisionId: DocumentRevisionId,
): Promise<UserId[]> {
  const { data: threads, error } = await client
    .from('comment_threads')
    .select('id')
    .eq('revision_id', revisionId);
  if (error) throw new Error(`listRevisionCommenterIds.threads: ${error.message}`);
  const threadIds = (threads ?? []).map((t) => (t as { id: string }).id);
  if (threadIds.length === 0) return [];
  const { data, error: cErr } = await client
    .from('comments')
    .select('author_id')
    .in('thread_id', threadIds);
  if (cErr) throw new Error(`listRevisionCommenterIds.comments: ${cErr.message}`);
  return [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { author_id: string | null }).author_id)
        .filter((id): id is string => id != null),
    ),
  ] as UserId[];
}

/** C3.5 — distinct comment authors in one thread (recipients for `comment_reply`). */
export async function listThreadParticipantIds(
  client: SupabaseClient,
  threadId: string,
): Promise<UserId[]> {
  const { data, error } = await client.from('comments').select('author_id').eq('thread_id', threadId);
  if (error) throw new Error(`listThreadParticipantIds: ${error.message}`);
  return [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { author_id: string | null }).author_id)
        .filter((id): id is string => id != null),
    ),
  ] as UserId[];
}
