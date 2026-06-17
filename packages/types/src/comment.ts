import { z } from 'zod';
import { requiredText, TEXT_LIMITS } from './text';

/**
 * C2 — block-anchored comment threads (collaboration spec §7). One pure source
 * (ADR-012) for the comment model: the lifecycle states, the body validator, and
 * the "who can resolve" rule. The repository (`@arther/db/comments`) and the app
 * comment panel consume these; orphaning (§7.5), text-range anchoring, and
 * @mentions (which route through C3 notifications) build on this core.
 */

/** Anchor granularity. Text-range is prose-only (collab spec §7.1); slice 1 ships block. */
export const COMMENT_ANCHOR_TYPES = ['block', 'text_range'] as const;
export type CommentAnchorType = (typeof COMMENT_ANCHOR_TYPES)[number];

/** A thread is open, resolved (collapsed, audited), or orphaned (anchor lost — §7.5). */
export const COMMENT_THREAD_STATUSES = ['open', 'resolved', 'orphaned'] as const;
export type CommentThreadStatus = (typeof COMMENT_THREAD_STATUSES)[number];

/** Text-range anchor payload (`comment_threads.text_anchor`). */
export interface TextAnchor {
  startOffset: number;
  endOffset: number;
  anchorText: string;
}

/** Comment body: required, trimmed, bounded (rich text may carry @mention tokens). */
export const commentBodySchema = requiredText('Write a comment.', TEXT_LIMITS.comment);

export const newCommentSchema = z.object({ body: commentBodySchema });
export type NewComment = z.infer<typeof newCommentSchema>;

/**
 * §7.4 — who may resolve a thread: the person who created it, the document owner
 * (or a workspace admin), or any assigned approver. Pure so the app action and
 * any future job agree on the rule.
 */
export function canResolveThread(input: {
  userId: string;
  threadCreatedBy: string | null;
  isOwner: boolean;
  isApprover: boolean;
}): boolean {
  if (input.isOwner || input.isApprover) return true;
  return input.threadCreatedBy != null && input.threadCreatedBy === input.userId;
}

/** A human label for a block anchor, for the comment composer / thread list. */
export function blockAnchorLabel(order: number, type: string): string {
  const pretty = type.replace(/_/g, ' ');
  return `Block ${order} · ${pretty}`;
}
