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

/**
 * C2.1 — locate a snippet in a block's plain text, producing a text-range anchor
 * (the first occurrence). The snippet is trimmed; returns null when it isn't
 * found, so the caller can fall back to a block-level anchor.
 */
export function findTextAnchor(textContent: string, snippet: string): TextAnchor | null {
  const needle = snippet.trim();
  if (needle.length === 0) return null;
  const start = textContent.indexOf(needle);
  if (start < 0) return null;
  return { startOffset: start, endOffset: start + needle.length, anchorText: needle };
}

/**
 * C2.3 — is a text-range anchor still valid against the block's current text?
 * The span at the stored offsets must still equal the anchored text (collab spec
 * §7.5): a writer editing or deleting the anchored span fails this check, so the
 * thread orphans (reason `text_edited`) rather than silently re-pointing.
 */
export function isTextAnchorValid(textContent: string | null, anchor: TextAnchor): boolean {
  if (textContent == null) return false;
  if (
    !Number.isInteger(anchor.startOffset) ||
    !Number.isInteger(anchor.endOffset) ||
    anchor.startOffset < 0 ||
    anchor.endOffset > textContent.length ||
    anchor.startOffset >= anchor.endOffset
  ) {
    return false;
  }
  return textContent.slice(anchor.startOffset, anchor.endOffset) === anchor.anchorText;
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

// --- C2.5 @mentions ----------------------------------------------------------

/**
 * The mention token embedded in a comment body: `@[Display Name](userId)`. The
 * user id is carried in the token so resolution is exact (mentions resolve to
 * workspace members only — collab spec §8) rather than a fuzzy name match.
 */
const MENTION_RE =
  /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/** Build a mention token for insertion into a comment body. */
export function formatMentionToken(name: string, userId: string): string {
  return `@[${name}](${userId})`;
}

/** The distinct mentioned user ids in a comment body (lowercased). */
export function extractMentionUserIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) ids.add(match[2]!.toLowerCase());
  return [...ids];
}

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; userId: string };

/** Split a comment body into plain-text + mention segments, for display. */
export function renderMentionSegments(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: 'text', value: body.slice(last, index) });
    segments.push({ type: 'mention', value: `@${match[1]}`, userId: match[2]!.toLowerCase() });
    last = index + match[0].length;
  }
  if (last < body.length) segments.push({ type: 'text', value: body.slice(last) });
  return segments;
}
