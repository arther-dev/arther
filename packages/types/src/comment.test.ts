import { describe, expect, it } from 'vitest';
import {
  blockAnchorLabel,
  canResolveThread,
  commentBodySchema,
  extractMentionUserIds,
  findTextAnchor,
  formatMentionToken,
  isTextAnchorValid,
  renderMentionSegments,
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

describe('@mentions (C2.5)', () => {
  const alice = '11111111-1111-1111-1111-111111111111';
  const bob = '22222222-2222-2222-2222-222222222222';
  const body = `Hi ${formatMentionToken('Alice', alice)} and ${formatMentionToken('Bob', bob)}, thoughts?`;

  it('extracts distinct mentioned user ids', () => {
    expect(extractMentionUserIds(body)).toEqual([alice, bob]);
    expect(extractMentionUserIds(`${formatMentionToken('Alice', alice)} ${formatMentionToken('Alice', alice)}`)).toEqual([
      alice,
    ]);
    expect(extractMentionUserIds('no mentions here')).toEqual([]);
  });

  it('renders body into text + mention segments', () => {
    const segments = renderMentionSegments(body);
    expect(segments[0]).toEqual({ type: 'text', value: 'Hi ' });
    expect(segments[1]).toEqual({ type: 'mention', value: '@Alice', userId: alice });
    expect(segments.filter((s) => s.type === 'mention')).toHaveLength(2);
    // round-trips the surrounding text
    expect(segments.map((s) => (s.type === 'mention' ? s.value : s.value)).join('')).toContain('thoughts?');
  });

  it('ignores a malformed token (no valid uuid)', () => {
    expect(extractMentionUserIds('@[Alice](not-a-uuid)')).toEqual([]);
    expect(renderMentionSegments('@[Alice](nope)')).toEqual([{ type: 'text', value: '@[Alice](nope)' }]);
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
