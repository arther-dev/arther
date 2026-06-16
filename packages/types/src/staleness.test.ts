import { describe, expect, it } from 'vitest';
import { summarizeStaleness } from './staleness';

describe('summarizeStaleness', () => {
  it('returns empty counts for no stale refs', () => {
    expect(summarizeStaleness([])).toEqual({ fields: [], blockIds: [], fieldCount: 0, blockCount: 0 });
  });

  it('dedupes fields and blocks (one field cited by two blocks; one block, two fields)', () => {
    const summary = summarizeStaleness([
      { blockId: 'b1', fieldName: 'Rated voltage' },
      { blockId: 'b2', fieldName: 'Rated voltage' },
      { blockId: 'b2', fieldName: 'Max current' },
    ]);
    expect(summary.fields).toEqual(['Rated voltage', 'Max current']);
    expect(summary.blockIds).toEqual(['b1', 'b2']);
    expect(summary.fieldCount).toBe(2);
    expect(summary.blockCount).toBe(2);
  });
});
