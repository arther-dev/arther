import { describe, expect, it } from 'vitest';
import { wouldCreateReferenceCycle } from './reference-graph';

describe('wouldCreateReferenceCycle (F5.9)', () => {
  it('blocks a self-reference', () => {
    expect(wouldCreateReferenceCycle([], { from: 'a', to: 'a' })).toBe(true);
  });

  it('blocks a direct A→B→A cycle', () => {
    expect(
      wouldCreateReferenceCycle([{ from: 'b', to: 'a' }], { from: 'a', to: 'b' }),
    ).toBe(true);
  });

  it('blocks a transitive A→B→C→A cycle', () => {
    expect(
      wouldCreateReferenceCycle(
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
        ],
        { from: 'c', to: 'a' },
      ),
    ).toBe(true);
  });

  it('allows a diamond (shared target, no cycle)', () => {
    expect(
      wouldCreateReferenceCycle(
        [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
          { from: 'b', to: 'd' },
        ],
        { from: 'c', to: 'd' },
      ),
    ).toBe(false);
  });

  it('ignores pre-existing cycles that do not pass through the candidate', () => {
    expect(
      wouldCreateReferenceCycle(
        [
          { from: 'x', to: 'y' },
          { from: 'y', to: 'x' },
        ],
        { from: 'a', to: 'b' },
      ),
    ).toBe(false);
  });
});
