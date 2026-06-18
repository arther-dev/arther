import { describe, expect, it } from 'vitest';
import { computeReviewReminders, type DueReview } from './review-reminder';

const base: DueReview = {
  documentId: 'doc-1',
  documentTitle: 'Datasheet',
  ownerId: 'owner-1',
  dueDate: '2026-06-18T00:00:00.000Z',
  pendingApproverIds: ['app-1', 'app-2'],
  pendingApproverNames: ['Alice', 'Bob'],
};

describe('computeReviewReminders (C3.6)', () => {
  it('on the due date, reminds the pending approvers', () => {
    const reminders = computeReviewReminders(base, new Date('2026-06-18T09:00:00Z'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ kind: 'due', recipientIds: ['app-1', 'app-2'] });
  });

  it('the day after, escalates to the owner with the outstanding names', () => {
    const reminders = computeReviewReminders(base, new Date('2026-06-19T09:00:00Z'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.kind).toBe('escalation');
    expect(reminders[0]!.recipientIds).toEqual(['owner-1']);
    expect(reminders[0]!.payload.outstanding).toEqual(['Alice', 'Bob']);
  });

  it('is silent before the due date and beyond the day after', () => {
    expect(computeReviewReminders(base, new Date('2026-06-17T23:59:00Z'))).toHaveLength(0);
    expect(computeReviewReminders(base, new Date('2026-06-20T09:00:00Z'))).toHaveLength(0);
  });

  it('no pending approvers → no due-date reminder (nobody to chase)', () => {
    const done = { ...base, pendingApproverIds: [], pendingApproverNames: [] };
    expect(computeReviewReminders(done, new Date('2026-06-18T09:00:00Z'))).toHaveLength(0);
  });

  it('no owner → no escalation', () => {
    const ownerless = { ...base, ownerId: null };
    expect(computeReviewReminders(ownerless, new Date('2026-06-19T09:00:00Z'))).toHaveLength(0);
  });
});
