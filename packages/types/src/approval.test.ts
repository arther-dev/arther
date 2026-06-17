import { describe, expect, it } from 'vitest';
import {
  overrideApprovalSchema,
  recordApprovalSchema,
  summarizeReview,
  type ApprovalRecordLike,
} from './approval';

const role = (id: string, required = true) => ({ id, label: id.toUpperCase(), required });
const rec = (roleId: string, action: ApprovalRecordLike['action'], reviewCycle: number) => ({
  roleId,
  action,
  reviewCycle,
});

describe('recordApprovalSchema (C1.2)', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  it('accepts an approval without a reason', () => {
    expect(recordApprovalSchema.safeParse({ roleId: id, action: 'approved' }).success).toBe(true);
  });
  it('requires a non-blank reason to send back (spec §6.2)', () => {
    expect(recordApprovalSchema.safeParse({ roleId: id, action: 'rejected' }).success).toBe(false);
    expect(recordApprovalSchema.safeParse({ roleId: id, action: 'rejected', reason: '  ' }).success).toBe(
      false,
    );
    expect(
      recordApprovalSchema.safeParse({ roleId: id, action: 'rejected', reason: 'see comments' }).success,
    ).toBe(true);
  });

  it('owner override always requires a reason (spec §3.3)', () => {
    expect(overrideApprovalSchema.safeParse({ roleId: id }).success).toBe(false);
    expect(overrideApprovalSchema.safeParse({ roleId: id, reason: '   ' }).success).toBe(false);
    expect(
      overrideApprovalSchema.safeParse({ roleId: id, reason: 'Regulatory lead is on leave' }).success,
    ).toBe(true);
  });
});

describe('summarizeReview AND-logic (C1.1)', () => {
  const roles = [role('tech'), role('reg'), role('brand', false)];

  it('is incomplete until every REQUIRED role has approved at the current cycle', () => {
    const partial = summarizeReview({
      roles,
      records: [rec('tech', 'approved', 1)],
      cycle: 1,
    });
    expect(partial.requiredCount).toBe(2);
    expect(partial.approvedCount).toBe(1);
    expect(partial.complete).toBe(false);
    expect(partial.roles.find((r) => r.roleId === 'reg')?.status).toBe('pending');
  });

  it('completes when all required roles approve (a non-required role is not gating)', () => {
    const full = summarizeReview({
      roles,
      records: [rec('tech', 'approved', 1), rec('reg', 'approved', 1)],
      cycle: 1,
    });
    expect(full.complete).toBe(true);
  });

  it('ignores approvals from a previous cycle (reset on rejection — spec §3.4)', () => {
    // tech approved in cycle 1, the doc was rejected, and re-submitted (cycle 2).
    const records = [
      rec('tech', 'approved', 1),
      rec('reg', 'rejected', 1),
      rec('reg', 'approved', 2),
    ];
    const cycle2 = summarizeReview({ roles, records, cycle: 2 });
    // tech's cycle-1 approval doesn't carry forward — it shows pending again.
    expect(cycle2.roles.find((r) => r.roleId === 'tech')?.status).toBe('pending');
    expect(cycle2.roles.find((r) => r.roleId === 'reg')?.status).toBe('approved');
    expect(cycle2.complete).toBe(false);
  });

  it('marks a role rejected when it has a rejection at the cycle', () => {
    const s = summarizeReview({ roles, records: [rec('tech', 'rejected', 1)], cycle: 1 });
    expect(s.roles.find((r) => r.roleId === 'tech')?.status).toBe('rejected');
  });

  it('counts an owner override as an approval for its role', () => {
    const s = summarizeReview({
      roles,
      records: [rec('tech', 'approved', 1), rec('reg', 'owner_override', 1)],
      cycle: 1,
    });
    expect(s.complete).toBe(true);
  });
});
