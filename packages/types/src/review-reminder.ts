import type { NotificationPayload } from './notification';

/**
 * C3.6 — review due-date reminders (collaboration spec §9.2). A daily job feeds
 * each in-review document with a due date through this pure decision:
 *   - on the due date → remind every still-pending approver;
 *   - the day after  → escalate to the document owner, naming who's outstanding.
 * Pure + UTC-day based so the job (and its tests) are deterministic regardless of
 * the time of day the cron fires. Both reminders dispatch as `review_overdue`.
 */
export interface DueReview {
  documentId: string;
  documentTitle: string;
  ownerId: string | null;
  /** `document_revisions.review_due_date` (ISO). */
  dueDate: string;
  /** User ids of approvers on roles that haven't approved yet. */
  pendingApproverIds: string[];
  /** Display names of those approvers, for the owner-escalation payload. */
  pendingApproverNames: string[];
}

export interface ReviewReminder {
  recipientIds: string[];
  payload: NotificationPayload;
  kind: 'due' | 'escalation';
}

/** The UTC calendar day as an integer day-count (ignores time of day). */
function utcDayIndex(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000,
  );
}

export function computeReviewReminders(review: DueReview, now: Date): ReviewReminder[] {
  const dueIndex = utcDayIndex(new Date(review.dueDate));
  const nowIndex = utcDayIndex(now);
  const out: ReviewReminder[] = [];

  if (nowIndex === dueIndex && review.pendingApproverIds.length > 0) {
    out.push({
      recipientIds: review.pendingApproverIds,
      kind: 'due',
      payload: { documentId: review.documentId, documentTitle: review.documentTitle },
    });
  } else if (nowIndex === dueIndex + 1 && review.ownerId) {
    out.push({
      recipientIds: [review.ownerId],
      kind: 'escalation',
      payload: {
        documentId: review.documentId,
        documentTitle: review.documentTitle,
        outstanding: review.pendingApproverNames,
      },
    });
  }
  return out;
}
