import { describe, expect, it } from 'vitest';
import { documentTypeDetailsSchema, forkDocumentTypeSchema } from './document-types';
import { TEXT_LIMITS } from './text';

describe('documentTypeDetailsSchema', () => {
  it('requires a non-empty name and trims it', () => {
    const ok = documentTypeDetailsSchema.safeParse({ name: '  Service Bulletin  ' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.name).toBe('Service Bulletin');
  });

  it('rejects an empty name', () => {
    expect(documentTypeDetailsSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('caps an oversized description', () => {
    const result = documentTypeDetailsSchema.safeParse({
      name: 'Datasheet',
      description: 'x'.repeat(TEXT_LIMITS.notes + 1),
    });
    expect(result.success).toBe(false);
  });

  it('treats a missing description as optional', () => {
    expect(documentTypeDetailsSchema.safeParse({ name: 'Datasheet' }).success).toBe(true);
  });
});

describe('forkDocumentTypeSchema', () => {
  it('accepts an omitted name (the fork keeps the source name)', () => {
    expect(forkDocumentTypeSchema.safeParse({}).success).toBe(true);
  });

  it('caps an oversized fork name', () => {
    expect(
      forkDocumentTypeSchema.safeParse({ name: 'x'.repeat(TEXT_LIMITS.name + 1) }).success,
    ).toBe(false);
  });
});
