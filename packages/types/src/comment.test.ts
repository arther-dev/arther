import { describe, expect, it } from 'vitest';
import { blockAnchorLabel, canResolveThread, commentBodySchema } from './comment';

describe('canResolveThread (C2.2, collab spec §7.4)', () => {
  const base = { userId: 'u1', threadCreatedBy: 'u2', isOwner: false, isApprover: false };

  it('the thread author can resolve their own thread', () => {
    expect(canResolveThread({ ...base, threadCreatedBy: 'u1' })).toBe(true);
  });
  it('the document owner / admin can resolve any thread', () => {
    expect(canResolveThread({ ...base, isOwner: true })).toBe(true);
  });
  it('an assigned approver can resolve any thread', () => {
    expect(canResolveThread({ ...base, isApprover: true })).toBe(true);
  });
  it('an unrelated member cannot resolve someone else’s thread', () => {
    expect(canResolveThread(base)).toBe(false);
  });
  it('a null creator never matches a user', () => {
    expect(canResolveThread({ ...base, threadCreatedBy: null })).toBe(false);
  });
});

describe('commentBodySchema', () => {
  it('requires non-empty trimmed text', () => {
    expect(commentBodySchema.safeParse('   ').success).toBe(false);
    expect(commentBodySchema.safeParse('looks good').success).toBe(true);
  });
  it('rejects an over-long body', () => {
    expect(commentBodySchema.safeParse('x'.repeat(10_001)).success).toBe(false);
  });
});

describe('blockAnchorLabel', () => {
  it('renders an order + humanised type', () => {
    expect(blockAnchorLabel(3, 'spec_table')).toBe('Block 3 · spec table');
  });
});
