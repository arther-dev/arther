import { describe, expect, it } from 'vitest';
import { moveInList } from './list-move';

describe('moveInList', () => {
  it('moves an item up', () => {
    expect(moveInList(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('moves an item down', () => {
    expect(moveInList(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op moving the first item up', () => {
    expect(moveInList(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op moving the last item down', () => {
    expect(moveInList(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const input = ['a', 'b'];
    moveInList(input, 0, 1);
    expect(input).toEqual(['a', 'b']);
  });

  it('returns a copy for an out-of-range index', () => {
    expect(moveInList(['a', 'b'], 5, -1)).toEqual(['a', 'b']);
  });
});
