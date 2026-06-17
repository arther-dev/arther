import { describe, expect, it } from 'vitest';
import {
  canManageDocumentLifecycle,
  canTransition,
  DOCUMENT_TRANSITIONS,
  resolveTransition,
  submitForReviewSchema,
  transitionActionsFor,
  transitionReasonSchema,
} from './document-lifecycle';

describe('document lifecycle transition map (C0.1)', () => {
  it('covers exactly the spec §3.2 transitions, each from a valid state', () => {
    const states = new Set(['draft', 'review', 'approved', 'published']);
    for (const t of DOCUMENT_TRANSITIONS) {
      expect(states.has(t.from)).toBe(true);
      expect(states.has(t.to)).toBe(true);
    }
    // Published has no outgoing edge except create_revision (snapshot immutability).
    const fromPublished = DOCUMENT_TRANSITIONS.filter((t) => t.from === 'published');
    expect(fromPublished.map((t) => t.action)).toEqual(['create_revision']);
  });

  it('resolves an action against its source state, including a multi-source action', () => {
    expect(resolveTransition('submit_for_review', 'draft')?.to).toBe('review');
    // pull_back_to_draft is valid from BOTH review and approved.
    expect(resolveTransition('pull_back_to_draft', 'review')?.to).toBe('draft');
    expect(resolveTransition('pull_back_to_draft', 'approved')?.to).toBe('draft');
    // But not from draft or published.
    expect(resolveTransition('pull_back_to_draft', 'draft')).toBeNull();
    expect(resolveTransition('publish', 'draft')).toBeNull();
  });

  it('canTransition is actor-aware (review→draft is owner pull-back OR approver reject)', () => {
    expect(canTransition('draft', 'review', 'owner')).toBe(true);
    expect(canTransition('draft', 'review', 'approver')).toBe(false);
    expect(canTransition('review', 'draft', 'owner')).toBe(true);
    expect(canTransition('review', 'draft', 'approver')).toBe(true);
    expect(canTransition('review', 'approved', 'system')).toBe(true);
    expect(canTransition('review', 'approved', 'owner')).toBe(false);
    expect(canTransition('approved', 'published', 'owner')).toBe(true);
    expect(canTransition('published', 'review', 'owner')).toBe(false);
  });

  it('reject is the only transition that requires a reason', () => {
    const reject = resolveTransition('reject', 'review');
    expect(reject?.requiresReason).toBe(true);
    expect(resolveTransition('publish', 'approved')?.requiresReason).toBe(false);
  });

  it('lists the owner actions available from each state', () => {
    expect(transitionActionsFor('draft', 'owner')).toEqual(['submit_for_review']);
    expect(transitionActionsFor('review', 'owner')).toEqual(['pull_back_to_draft']);
    expect(transitionActionsFor('approved', 'owner')).toEqual([
      'pull_back_to_draft',
      'pull_back_to_review',
      'publish',
    ]);
    expect(transitionActionsFor('published', 'owner')).toEqual(['create_revision']);
    // The approver/system edges never surface as owner affordances.
    expect(transitionActionsFor('review', 'approver')).toEqual(['reject']);
    expect(transitionActionsFor('review', 'system')).toEqual(['approve_complete']);
  });
});

describe('canManageDocumentLifecycle (spec §2.4 / §4.3)', () => {
  const owner = 'u-owner';
  it('the document owner manages it regardless of workspace role', () => {
    expect(
      canManageDocumentLifecycle({ documentOwnerId: owner, userId: owner, role: 'member' }),
    ).toBe(true);
  });
  it('a workspace owner/admin manages any document', () => {
    expect(
      canManageDocumentLifecycle({ documentOwnerId: 'someone-else', userId: 'u-admin', role: 'admin' }),
    ).toBe(true);
    expect(
      canManageDocumentLifecycle({ documentOwnerId: null, userId: 'u-owner', role: 'owner' }),
    ).toBe(true);
  });
  it('a non-owner member cannot, and a null owner has no individual manager', () => {
    expect(
      canManageDocumentLifecycle({ documentOwnerId: 'someone-else', userId: 'u-x', role: 'member' }),
    ).toBe(false);
    expect(
      canManageDocumentLifecycle({ documentOwnerId: null, userId: 'u-x', role: 'member' }),
    ).toBe(false);
  });
});

describe('submission metadata schema (C0.4)', () => {
  it('accepts an empty submission, a message, and a YYYY-MM-DD due date', () => {
    expect(submitForReviewSchema.safeParse({}).success).toBe(true);
    expect(
      submitForReviewSchema.safeParse({ reviewBrief: 'Focus on the safety section', reviewDueDate: '2026-07-01' })
        .success,
    ).toBe(true);
    expect(submitForReviewSchema.safeParse({ reviewDueDate: '' }).success).toBe(true);
  });
  it('rejects a malformed due date and an over-long brief', () => {
    expect(submitForReviewSchema.safeParse({ reviewDueDate: '07/01/2026' }).success).toBe(false);
    expect(submitForReviewSchema.safeParse({ reviewBrief: 'x'.repeat(4_001) }).success).toBe(false);
  });
  it('a rejection reason cannot be blank', () => {
    expect(transitionReasonSchema.safeParse('   ').success).toBe(false);
    expect(transitionReasonSchema.safeParse('see comments').success).toBe(true);
  });
});
