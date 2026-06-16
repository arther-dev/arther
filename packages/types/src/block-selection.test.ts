import { describe, expect, it } from 'vitest';
import { rangeSelection, toggleSelection } from './block-selection';

describe('toggleSelection', () => {
  it('adds an id that is not present', () => {
    expect([...toggleSelection(new Set(['a']), 'b')].sort()).toEqual(['a', 'b']);
  });

  it('removes an id that is present', () => {
    expect([...toggleSelection(new Set(['a', 'b']), 'b')]).toEqual(['a']);
  });

  it('does not mutate the input set', () => {
    const current = new Set(['a']);
    toggleSelection(current, 'b');
    expect([...current]).toEqual(['a']);
  });
});

describe('rangeSelection', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('selects the inclusive span when the anchor is before the target', () => {
    expect([...rangeSelection(ids, 'b', 'd')]).toEqual(['b', 'c', 'd']);
  });

  it('is order-independent (selecting upward yields the same span)', () => {
    expect([...rangeSelection(ids, 'd', 'b')]).toEqual(['b', 'c', 'd']);
  });

  it('selects a single block when anchor and target match', () => {
    expect([...rangeSelection(ids, 'c', 'c')]).toEqual(['c']);
  });

  it('spans the whole list end to end', () => {
    expect([...rangeSelection(ids, 'a', 'e')]).toEqual(ids);
  });

  it('returns an empty set when an id is unknown', () => {
    expect([...rangeSelection(ids, 'a', 'z')]).toEqual([]);
    expect([...rangeSelection(ids, 'z', 'a')]).toEqual([]);
  });
});
