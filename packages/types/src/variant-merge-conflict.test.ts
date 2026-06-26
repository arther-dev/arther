import { describe, expect, it } from 'vitest';
import {
  MERGE_CONFLICT_RESOLUTIONS,
  mergeConflictResolutionSchema,
  parseMergeConflictVersions,
} from './variant-merge-conflict';

describe('mergeConflictResolutionSchema', () => {
  it('accepts the four resolutions and rejects others', () => {
    for (const r of MERGE_CONFLICT_RESOLUTIONS) {
      expect(mergeConflictResolutionSchema.safeParse(r).success).toBe(true);
    }
    expect(mergeConflictResolutionSchema.safeParse('nope').success).toBe(false);
  });
});

describe('parseMergeConflictVersions', () => {
  it('reads both snake_case (db) and camelCase shapes', () => {
    expect(
      parseMergeConflictVersions([
        { variant_id: 'v1', block_id: 'b1' },
        { variantId: 'v2', blockId: 'b2' },
      ]),
    ).toEqual([
      { variantId: 'v1', blockId: 'b1' },
      { variantId: 'v2', blockId: 'b2' },
    ]);
  });

  it('drops malformed entries and non-arrays', () => {
    expect(parseMergeConflictVersions([{ variant_id: 'v1' }, null, 'x', { block_id: 'b' }])).toEqual([]);
    expect(parseMergeConflictVersions(null)).toEqual([]);
    expect(parseMergeConflictVersions('[]')).toEqual([]);
  });
});
