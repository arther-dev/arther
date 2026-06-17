import { describe, expect, it } from 'vitest';
import {
  blockAnchorLabel,
  canResolveThread,
  commentBodySchema,
  findTextAnchor,
  isTextAnchorValid,
} from './comment';

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

describe('text-range anchoring (C2.1)', () => {
  const text = 'The motor is rated at 36 V continuous.';

  it('findTextAnchor locates a snippet and returns its offsets', () => {
    expect(findTextAnchor(text, 'rated at 36 V')).toEqual({
      startOffset: 13,
      endOffset: 26,
      anchorText: 'rated at 36 V',
    });
    expect(text.slice(13, 26)).toBe('rated at 36 V'); // offsets are correct
  });
  it('findTextAnchor trims and returns null when absent', () => {
    expect(findTextAnchor(text, '  36 V  ')).not.toBeNull();
    expect(findTextAnchor(text, 'rated at 48 V')).toBeNull();
    expect(findTextAnchor(text, '   ')).toBeNull();
  });
});

describe('isTextAnchorValid (C2.3 text_edited)', () => {
  const text = 'rated at 36 V';
  it('holds while the span still matches', () => {
    expect(isTextAnchorValid(text, { startOffset: 9, endOffset: 13, anchorText: '36 V' })).toBe(true);
  });
  it('fails when the anchored text changed (36 V → 48 V)', () => {
    expect(isTextAnchorValid('rated at 48 V', { startOffset: 9, endOffset: 13, anchorText: '36 V' })).toBe(
      false,
    );
  });
  it('fails on out-of-bounds offsets or null text', () => {
    expect(isTextAnchorValid('short', { startOffset: 0, endOffset: 99, anchorText: 'x' })).toBe(false);
    expect(isTextAnchorValid(null, { startOffset: 0, endOffset: 1, anchorText: 'x' })).toBe(false);
    expect(isTextAnchorValid('abc', { startOffset: 2, endOffset: 1, anchorText: '' })).toBe(false);
  });
});
