import { z } from 'zod';
import type { DocumentState } from './document';
import type { WorkspaceRole } from './workspace';
import { optionalText, TEXT_LIMITS } from './text';

/**
 * C0 — the document lifecycle state machine (Collaboration & Review spec §3).
 * The one pure source (ADR-012) for the four-state transition map, read by the
 * `@arther/db` repository (which issues the guarded state UPDATE) and the app
 * (which renders the owner's available actions and authorizes them).
 *
 * Persistence: a document's lifecycle state lives on `document_revisions.state`
 * (migration 0005 — CHECK draft|review|approved|published). "Published" is a tag
 * on an immutable snapshot, not a mutable state (spec §2.2): the working copy
 * moves Draft → Review → Approved, and Publish freezes a snapshot. C0 drives the
 * state column; the snapshot resolver + `published_snapshots` write is C4, and
 * the approver approve/reject gate (AND-logic) is C1 — both consume this map.
 */

// --- Actors -------------------------------------------------------------------

/**
 * Who may drive a transition (spec §2.4 / §4.3):
 * - `owner`    — the document owner (or a workspace admin acting on their behalf)
 * - `approver` — an assigned approver for the Document Type (wired in C1)
 * - `system`   — automatic, when the last required approval completes (C1)
 */
export const DOCUMENT_ACTORS = ['owner', 'approver', 'system'] as const;
export type DocumentActor = (typeof DOCUMENT_ACTORS)[number];

// --- Transition actions -------------------------------------------------------

export const DOCUMENT_TRANSITION_ACTIONS = [
  'submit_for_review', // draft → review (owner)
  'pull_back_to_draft', // review → draft, approved → draft (owner)
  'pull_back_to_review', // approved → review (owner)
  'reject', // review → draft (approver; reason required) — C1
  'approve_complete', // review → approved (system; all approvers in) — C1
  'publish', // approved → published (owner)
  'create_revision', // published → draft (owner; forks a new working copy)
] as const;
export type DocumentTransitionAction = (typeof DOCUMENT_TRANSITION_ACTIONS)[number];

export interface DocumentTransition {
  action: DocumentTransitionAction;
  from: DocumentState;
  to: DocumentState;
  actor: DocumentActor;
  /** A free-text reason is mandatory (reject / owner-override; spec §6.2). */
  requiresReason: boolean;
}

/**
 * The complete transition map (spec §3.2). Owner-driven transitions are wired in
 * C0; the approver `reject` and the system `approve_complete` rows are part of
 * the canonical map but their wiring (the AND-logic approval gate) lands in C1.
 */
export const DOCUMENT_TRANSITIONS: readonly DocumentTransition[] = [
  { action: 'submit_for_review', from: 'draft', to: 'review', actor: 'owner', requiresReason: false },
  { action: 'pull_back_to_draft', from: 'review', to: 'draft', actor: 'owner', requiresReason: false },
  { action: 'pull_back_to_draft', from: 'approved', to: 'draft', actor: 'owner', requiresReason: false },
  { action: 'pull_back_to_review', from: 'approved', to: 'review', actor: 'owner', requiresReason: false },
  { action: 'reject', from: 'review', to: 'draft', actor: 'approver', requiresReason: true },
  { action: 'approve_complete', from: 'review', to: 'approved', actor: 'system', requiresReason: false },
  { action: 'publish', from: 'approved', to: 'published', actor: 'owner', requiresReason: false },
  { action: 'create_revision', from: 'published', to: 'draft', actor: 'owner', requiresReason: false },
] as const;

/** Human labels for the transition controls (spec §3.2 / §5.1). */
export const DOCUMENT_TRANSITION_LABELS: Record<DocumentTransitionAction, string> = {
  submit_for_review: 'Send for review',
  pull_back_to_draft: 'Pull back to draft',
  pull_back_to_review: 'Pull back to review',
  reject: 'Send back',
  approve_complete: 'Approve',
  publish: 'Publish',
  create_revision: 'Create revision',
};

// --- Pure helpers -------------------------------------------------------------

/** The unique transition for an action out of a given state, or null. */
export function resolveTransition(
  action: DocumentTransitionAction,
  from: DocumentState,
): DocumentTransition | null {
  return DOCUMENT_TRANSITIONS.find((t) => t.action === action && t.from === from) ?? null;
}

/** Whether a (from → to) transition exists for the given actor. */
export function canTransition(from: DocumentState, to: DocumentState, actor: DocumentActor): boolean {
  return DOCUMENT_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor);
}

/** The transition actions an actor may take from a state — the UI's affordances. */
export function transitionActionsFor(
  from: DocumentState,
  actor: DocumentActor,
): DocumentTransitionAction[] {
  return DOCUMENT_TRANSITIONS.filter((t) => t.from === from && t.actor === actor).map((t) => t.action);
}

/**
 * Whether a member may drive a document's lifecycle (spec §2.4 / §4.3 "Owner"
 * actions): the document's own owner, or a workspace admin/owner acting on any
 * document. The canDo seat check (editor-only) gates this in the app too — a
 * viewer is denied there regardless of ownership.
 */
export function canManageDocumentLifecycle(input: {
  documentOwnerId: string | null;
  userId: string;
  role: WorkspaceRole;
}): boolean {
  if (input.role === 'owner' || input.role === 'admin') return true;
  return input.documentOwnerId != null && input.documentOwnerId === input.userId;
}

// --- Submission metadata (spec §5.1; C0.4) -----------------------------------

/** Optional review brief + due date set when sending a document for review. */
export const submitForReviewSchema = z.object({
  reviewBrief: optionalText(TEXT_LIMITS.notes),
  reviewDueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
    .optional()
    .or(z.literal('')),
});
export type SubmitForReview = z.infer<typeof submitForReviewSchema>;

/** A mandatory reason (reject / owner-override; spec §6.2) — bounded free text. */
export const transitionReasonSchema = z
  .string()
  .trim()
  .min(1, 'A reason is required.')
  .max(TEXT_LIMITS.notes, `Keep it under ${TEXT_LIMITS.notes} characters.`);
