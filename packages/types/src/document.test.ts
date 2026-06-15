import { describe, expect, it } from 'vitest';
import {
  BLOCK_REFERENCE_TYPES,
  BLOCK_SOURCES,
  DOCUMENT_STATES,
  blockSpecReferenceInputSchema,
  documentCreateSchema,
  documentSlugSchema,
  placeholderBriefReferenceInputSchema,
  slugifyTitle,
} from './document';

const UUID = '00000000-0000-4000-8000-000000000000';

describe('document persistence enums', () => {
  it('mirror the migration 0005 CHECK constraints', () => {
    expect(DOCUMENT_STATES).toEqual(['draft', 'review', 'approved', 'published']);
    expect(BLOCK_SOURCES).toEqual(['spec', 'brief', 'placeholder', 'manual', 'snippet', 'structural']);
    expect(BLOCK_REFERENCE_TYPES).toEqual(['generated', 'manually_linked', 'chart']);
  });
});

describe('slugifyTitle', () => {
  it('lowercases, strips punctuation, and collapses whitespace to hyphens', () => {
    expect(slugifyTitle('Servo Drive S2 — Datasheet!')).toBe('servo-drive-s2-datasheet');
  });

  it('folds accents and trims leading/trailing hyphens', () => {
    expect(slugifyTitle('  Câblage & Réglage  ')).toBe('cablage-reglage');
  });

  it('falls back to "document" when nothing slug-able remains', () => {
    expect(slugifyTitle('!!!')).toBe('document');
    expect(slugifyTitle('')).toBe('document');
  });

  it('always produces a value the slug schema accepts', () => {
    for (const title of ['A', 'Hello World', '中文 Title 2', '...edge...']) {
      expect(documentSlugSchema.safeParse(slugifyTitle(title)).success).toBe(true);
    }
  });
});

describe('documentCreateSchema', () => {
  it('accepts a titled document with valid ids and an optional brand', () => {
    const parsed = documentCreateSchema.parse({
      title: '  Installation Guide  ',
      productId: UUID,
      documentTypeId: UUID,
    });
    expect(parsed.title).toBe('Installation Guide');
    expect(parsed.brandProfileId).toBeUndefined();
  });

  it('rejects an empty title and a non-uuid product', () => {
    expect(documentCreateSchema.safeParse({ title: '   ', productId: UUID, documentTypeId: UUID }).success).toBe(false);
    expect(documentCreateSchema.safeParse({ title: 'X', productId: 'nope', documentTypeId: UUID }).success).toBe(false);
  });
});

describe('reference write inputs', () => {
  it('defaults a spec reference to the generated reference type', () => {
    const parsed = blockSpecReferenceInputSchema.parse({
      blockId: UUID,
      fieldId: UUID,
      fieldVersionId: UUID,
    });
    expect(parsed.referenceType).toBe('generated');
  });

  it('rejects a placeholder reference with a malformed fragment key', () => {
    expect(
      placeholderBriefReferenceInputSchema.safeParse({
        blockId: UUID,
        entityType: 'product',
        entityId: UUID,
        fragmentKey: 'Not A Slug',
      }).success,
    ).toBe(false);
  });
});
