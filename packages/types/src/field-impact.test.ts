import { describe, expect, it } from 'vitest';
import {
  describeFieldChangeImpact,
  fieldChangeHasImpact,
  listImpactedDocuments,
  type FieldChangeImpact,
} from './field-impact';

const impact = (over: Partial<FieldChangeImpact> = {}): FieldChangeImpact => ({
  documentCount: 0,
  blockCount: 0,
  documentTitles: [],
  more: 0,
  ...over,
});

describe('fieldChangeHasImpact (G6.6)', () => {
  it('is false when no document cites the field', () => {
    expect(fieldChangeHasImpact(impact())).toBe(false);
  });

  it('is true once at least one document cites the field', () => {
    expect(fieldChangeHasImpact(impact({ documentCount: 1, blockCount: 1 }))).toBe(true);
  });
});

describe('describeFieldChangeImpact (G6.6)', () => {
  it('returns an empty string for a zero-impact change', () => {
    expect(describeFieldChangeImpact(impact())).toBe('');
  });

  it('uses the singular for one document and one block', () => {
    expect(describeFieldChangeImpact(impact({ documentCount: 1, blockCount: 1 }))).toBe(
      'This change affects 1 document (1 block).',
    );
  });

  it('pluralises documents and blocks independently', () => {
    expect(describeFieldChangeImpact(impact({ documentCount: 3, blockCount: 5 }))).toBe(
      'This change affects 3 documents (5 blocks).',
    );
    // One document, several blocks within it.
    expect(describeFieldChangeImpact(impact({ documentCount: 1, blockCount: 4 }))).toBe(
      'This change affects 1 document (4 blocks).',
    );
  });
});

describe('listImpactedDocuments (G6.6)', () => {
  it('is empty when there are no titles', () => {
    expect(listImpactedDocuments(impact())).toBe('');
  });

  it('joins the listed titles', () => {
    expect(
      listImpactedDocuments(impact({ documentCount: 2, documentTitles: ['Servo A', 'Inverter X'] })),
    ).toBe('Servo A, Inverter X');
  });

  it('appends a "+N more" suffix when documents overflow the title cap', () => {
    expect(
      listImpactedDocuments(
        impact({ documentCount: 7, documentTitles: ['Servo A', 'Inverter X'], more: 5 }),
      ),
    ).toBe('Servo A, Inverter X +5 more');
  });
});
