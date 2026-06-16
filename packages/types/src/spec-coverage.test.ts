import { describe, expect, it } from 'vitest';
import { aggregateSpecCoverage, summariseCoverage } from './spec-coverage';

describe('aggregateSpecCoverage', () => {
  it('counts distinct documents per field', () => {
    const cov = aggregateSpecCoverage([
      { fieldId: 'a', documentId: 'd1' },
      { fieldId: 'a', documentId: 'd2' },
      { fieldId: 'b', documentId: 'd1' },
    ]);
    expect(cov.documentCountByField.get('a')).toBe(2);
    expect(cov.documentCountByField.get('b')).toBe(1);
  });

  it('de-duplicates repeated (field, document) references', () => {
    const cov = aggregateSpecCoverage([
      { fieldId: 'a', documentId: 'd1' },
      { fieldId: 'a', documentId: 'd1' },
      { fieldId: 'a', documentId: 'd1' },
    ]);
    expect(cov.documentCountByField.get('a')).toBe(1);
    expect(cov.documentCount).toBe(1);
  });

  it('counts distinct documents across all fields', () => {
    const cov = aggregateSpecCoverage([
      { fieldId: 'a', documentId: 'd1' },
      { fieldId: 'b', documentId: 'd2' },
      { fieldId: 'c', documentId: 'd1' },
    ]);
    expect(cov.documentCount).toBe(2);
  });

  it('is empty for no references', () => {
    const cov = aggregateSpecCoverage([]);
    expect(cov.documentCount).toBe(0);
    expect(cov.documentCountByField.size).toBe(0);
  });
});

describe('summariseCoverage', () => {
  const counts = new Map([
    ['a', 2],
    ['b', 1],
  ]);

  it('counts a field as covered when referenced by ≥ 1 document', () => {
    expect(summariseCoverage(['a', 'b', 'c'], counts)).toEqual({ covered: 2, total: 3 });
  });

  it('treats an absent or zero count as uncovered', () => {
    expect(summariseCoverage(['c', 'd'], counts)).toEqual({ covered: 0, total: 2 });
    expect(summariseCoverage(['a'], new Map([['a', 0]]))).toEqual({ covered: 0, total: 1 });
  });

  it('counts duplicate field ids once', () => {
    expect(summariseCoverage(['a', 'a', 'b'], counts)).toEqual({ covered: 2, total: 2 });
  });

  it('is zero over no fields', () => {
    expect(summariseCoverage([], counts)).toEqual({ covered: 0, total: 0 });
  });
});
