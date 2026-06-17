'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { CommentThreadView } from '@arther/db';
import {
  addCommentAction,
  replyToThreadAction,
  reopenThreadAction,
  resolveThreadAction,
} from './comment-actions';

/**
 * C2.1/C2.2 — the document comment panel: block-anchored threads with one-level
 * replies and resolve/reopen. Commenting is open to any member (incl. viewers);
 * resolve is gated server-side (§7.4). Text-range anchoring, orphan badges, and
 * @mention routing (C3) layer on later.
 */

export interface BlockOption {
  id: string;
  label: string;
}

export function CommentsPanel({
  documentId,
  threads,
  blocks,
  currentUserId,
  canResolveAny,
}: {
  documentId: string;
  threads: CommentThreadView[];
  blocks: BlockOption[];
  currentUserId: string;
  canResolveAny: boolean;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const blockLabels = useMemo(() => new Map(blocks.map((b) => [b.id, b.label])), [blocks]);

  const open = threads.filter((t) => t.status === 'open');
  const visible = showResolved ? threads : open;
  const resolvedCount = threads.length - open.length;

  return (
    <section className="comments" aria-label="Comments">
      <div className="comments__head">
        <h2 className="comments__title">Comments {open.length > 0 ? `(${open.length})` : ''}</h2>
        {resolvedCount > 0 && (
          <label className="comments__toggle">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            Show resolved ({resolvedCount})
          </label>
        )}
      </div>

      <Composer documentId={documentId} blocks={blocks} />

      {visible.length === 0 ? (
        <p className="specs-grid__meta">No comments yet. Anchor feedback to a block above.</p>
      ) : (
        <ul className="comments__list">
          {visible.map((thread) => (
            <Thread
              key={thread.id}
              documentId={documentId}
              thread={thread}
              anchorLabel={
                thread.blockId
                  ? (blockLabels.get(thread.blockId) ?? 'Block')
                  : 'Deleted block'
              }
              canResolve={canResolveAny || thread.createdBy === currentUserId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Composer({ documentId, blocks }: { documentId: string; blocks: BlockOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blockId, setBlockId] = useState(blocks[0]?.id ?? '');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (blocks.length === 0) {
    return <p className="specs-grid__meta">Add content to the document before commenting.</p>;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await addCommentAction(documentId, { blockId, body });
      if (result.ok) {
        setBody('');
        router.refresh();
      } else {
        setError(result.error ?? 'Could not post the comment.');
      }
    });
  }

  return (
    <form className="comments__composer" onSubmit={submit}>
      <div className="doc-lifecycle__row">
        <label className="ui-field">
          <span className="ui-field__label">On</span>
          <select
            className="ui-field__input"
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
            aria-label="Block to comment on"
          >
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="ui-field__input"
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        aria-label="Comment"
        required
      />
      <div className="doc-lifecycle__row">
        <button type="submit" className="ui-btn ui-btn--primary" disabled={pending}>
          {pending ? 'Posting…' : 'Comment'}
        </button>
      </div>
      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Thread({
  documentId,
  thread,
  anchorLabel,
  canResolve,
}: {
  documentId: string;
  thread: CommentThreadView;
  anchorLabel: string;
  canResolve: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  function postReply(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await replyToThreadAction(documentId, { threadId: thread.id, body: reply });
      if (result.ok) {
        setReply('');
        router.refresh();
      } else {
        setError(result.error ?? 'Could not reply.');
      }
    });
  }

  function toggleResolved() {
    setError(null);
    start(async () => {
      const result =
        thread.status === 'resolved'
          ? await reopenThreadAction(documentId, thread.id)
          : await resolveThreadAction(documentId, thread.id);
      if (result.ok) router.refresh();
      else setError(result.error ?? 'Could not update the thread.');
    });
  }

  return (
    <li className={`comments__thread comments__thread--${thread.status}`}>
      <div className="comments__thread-head">
        <span className="specs-grid__meta">{anchorLabel}</span>
        {thread.inheritedFromThreadId && (
          <span className="comments__badge" title="Carried forward from the previous revision">
            inherited
          </span>
        )}
        {thread.status === 'orphaned' && <span className="comments__badge">orphaned</span>}
        {thread.status === 'resolved' && <span className="comments__badge">resolved</span>}
        {canResolve && thread.status !== 'orphaned' && (
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={pending}
            onClick={toggleResolved}
          >
            {thread.status === 'resolved' ? 'Reopen' : 'Resolve'}
          </button>
        )}
      </div>

      <ul className="comments__comments">
        {thread.comments.map((comment) => (
          <li
            key={comment.id}
            className={`comments__comment ${comment.parentCommentId ? 'comments__comment--reply' : ''}`}
          >
            <span className="comments__author">{comment.authorName}</span>
            <span className="comments__body">{comment.body}</span>
          </li>
        ))}
      </ul>

      {thread.status === 'open' && (
        <form className="comments__reply" onSubmit={postReply}>
          <input
            className="ui-field__input"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply…"
            aria-label="Reply"
            required
          />
          <button type="submit" className="ui-btn ui-btn--ghost" disabled={pending}>
            Reply
          </button>
        </form>
      )}
      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
