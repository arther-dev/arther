import { describe, expect, it } from 'vitest';
import {
  createLibraryItemSchema,
  libraryItemTypeDescription,
  libraryItemTypeLabel,
  LIBRARY_ITEM_TYPES,
  renameLibraryItemSchema,
} from './library';

describe('library item types (R.1)', () => {
  it('labels both types', () => {
    expect(libraryItemTypeLabel('snippet')).toBe('Snippet');
    expect(libraryItemTypeLabel('template')).toBe('Template');
  });

  it('describes the distinct insertion behaviour of each type', () => {
    expect(libraryItemTypeDescription('snippet')).toMatch(/propagate/i);
    expect(libraryItemTypeDescription('template')).toMatch(/copy/i);
    // The two descriptions must be different — that distinction is the whole point.
    expect(libraryItemTypeDescription('snippet')).not.toBe(libraryItemTypeDescription('template'));
  });

  it('exposes exactly snippet + template', () => {
    expect([...LIBRARY_ITEM_TYPES]).toEqual(['snippet', 'template']);
  });
});

describe('createLibraryItemSchema (R.1)', () => {
  it('trims the name and accepts a valid type', () => {
    const parsed = createLibraryItemSchema.parse({ name: '  Warranty notice  ', type: 'snippet' });
    expect(parsed).toEqual({ name: 'Warranty notice', type: 'snippet' });
  });

  it('rejects an empty name', () => {
    const r = createLibraryItemSchema.safeParse({ name: '   ', type: 'template' });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown type', () => {
    const r = createLibraryItemSchema.safeParse({ name: 'X', type: 'macro' });
    expect(r.success).toBe(false);
  });
});

describe('renameLibraryItemSchema (R.1)', () => {
  it('trims and requires a name', () => {
    expect(renameLibraryItemSchema.parse({ name: ' Safety ' })).toEqual({ name: 'Safety' });
    expect(renameLibraryItemSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
