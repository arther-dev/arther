import { describe, expect, it } from 'vitest';
import { groupReplies } from './thread';

interface C {
  id: string;
  parent: string | null;
}
const group = (items: C[]) =>
  groupReplies(
    items,
    (c) => c.id,
    (c) => c.parent,
  );

describe('groupReplies', () => {
  it('separates roots from replies grouped by parent', () => {
    const { roots, repliesByParent } = group([
      { id: 'a', parent: null },
      { id: 'b', parent: 'a' },
      { id: 'c', parent: null },
      { id: 'd', parent: 'a' },
    ]);
    expect(roots.map((r) => r.id)).toEqual(['a', 'c']);
    expect(repliesByParent.get('a')!.map((r) => r.id)).toEqual(['b', 'd']);
    expect(repliesByParent.has('c')).toBe(false);
  });

  it('preserves input order within roots and within a thread', () => {
    const { roots, repliesByParent } = group([
      { id: 'r1', parent: null },
      { id: 'x2', parent: 'r1' },
      { id: 'x1', parent: 'r1' },
      { id: 'r2', parent: null },
    ]);
    expect(roots.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(repliesByParent.get('r1')!.map((r) => r.id)).toEqual(['x2', 'x1']);
  });

  it('treats a reply to an unknown parent as a root (no orphans dropped)', () => {
    const { roots, repliesByParent } = group([{ id: 'b', parent: 'gone' }]);
    expect(roots.map((r) => r.id)).toEqual(['b']);
    expect(repliesByParent.size).toBe(0);
  });

  it('is empty for no items', () => {
    const { roots, repliesByParent } = group([]);
    expect(roots).toEqual([]);
    expect(repliesByParent.size).toBe(0);
  });
});
