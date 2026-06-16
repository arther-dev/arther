import { describe, expect, it } from 'vitest';
import { summarizeBriefStaleness, summarizeStaleness } from './staleness';

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

describe('summarizeBriefStaleness (G7.3)', () => {
  it('returns empty counts for no stale brief refs', () => {
    expect(summarizeBriefStaleness([])).toEqual({ keys: [], blockIds: [], keyCount: 0, blockCount: 0 });
  });

  it('dedupes fragment keys and blocks', () => {
    const summary = summarizeBriefStaleness([
      { blockId: 'b1', fragmentKey: 'overview' },
      { blockId: 'b2', fragmentKey: 'overview' },
      { blockId: 'b2', fragmentKey: 'target_applications' },
    ]);
    expect(summary.keys).toEqual(['overview', 'target_applications']);
    expect(summary.blockIds).toEqual(['b1', 'b2']);
    expect(summary.keyCount).toBe(2);
    expect(summary.blockCount).toBe(2);
  });
});
