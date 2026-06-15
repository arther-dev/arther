import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPES,
  blockTypeSchema,
  documentTypeSectionSchema,
  parseTokenList,
} from './document-types';

describe('block types', () => {
  it('matches the migration 0005 blocks CHECK set (no drift)', () => {
    // The generator can only emit block types the editor/renderer support; this
    // list is the single source mirrored by the `blocks.type` CHECK constraint.
    expect(BLOCK_TYPES).toContain('spec_table');
    expect(BLOCK_TYPES).toContain('step_wizard');
    expect(BLOCK_TYPES).toHaveLength(20);
    expect(new Set(BLOCK_TYPES).size).toBe(BLOCK_TYPES.length);
  });

  it('rejects unknown block types', () => {
    expect(blockTypeSchema.safeParse('paragraph').success).toBe(true);
    expect(blockTypeSchema.safeParse('tabs').success).toBe(false);
  });
});

describe('parseTokenList', () => {
  it('splits on commas and newlines, trims, de-dupes, preserves order', () => {
    expect(parseTokenList('Electrical, Mechanical\nElectrical , Performance')).toEqual([
      'Electrical',
      'Mechanical',
      'Performance',
    ]);
  });

  it('returns [] for empty/nullish input', () => {
    expect(parseTokenList('')).toEqual([]);
    expect(parseTokenList(null)).toEqual([]);
    expect(parseTokenList(undefined)).toEqual([]);
    expect(parseTokenList('  ,  ,\n')).toEqual([]);
  });

  it('caps the number of tokens', () => {
    const raw = Array.from({ length: 100 }, (_, i) => `c${i}`).join(',');
    expect(parseTokenList(raw, 10)).toHaveLength(10);
  });
});

describe('documentTypeSectionSchema', () => {
  const valid = {
    name: 'Electrical Characteristics',
    spec_field_categories: ['Electrical'],
    brief_fragment_keys: [],
    brief_required: false,
    default_block_types: ['section_header', 'spec_table'] as const,
  };

  it('accepts a well-formed section', () => {
    expect(documentTypeSectionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(documentTypeSectionSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('rejects an unknown block type in the contract', () => {
    expect(
      documentTypeSectionSchema.safeParse({ ...valid, default_block_types: ['tabs'] }).success,
    ).toBe(false);
  });

  it('rejects oversized category tokens', () => {
    expect(
      documentTypeSectionSchema.safeParse({
        ...valid,
        spec_field_categories: ['x'.repeat(500)],
      }).success,
    ).toBe(false);
  });
});
