/**
 * F6 — generic one-level reply threading. Splits a flat list into roots (no
 * parent) and replies grouped by their parent id, preserving input order within
 * each bucket. Pure, so the UI threads comments without a DB round-trip and the
 * grouping is unit-testable. One level deep by design (replies are not re-nested)
 * — matching the field-comment model (`parent_comment_id` references a root).
 */
export function groupReplies<T>(
  items: readonly T[],
  id: (item: T) => string,
  parentId: (item: T) => string | null,
): { roots: T[]; repliesByParent: Map<string, T[]> } {
  const roots: T[] = [];
  const repliesByParent = new Map<string, T[]>();
  const known = new Set(items.map(id));
  for (const item of items) {
    const parent = parentId(item);
    // A reply whose parent isn't in the set (deleted/out of scope) shows as a root.
    if (parent === null || !known.has(parent)) {
      roots.push(item);
      continue;
    }
    const list = repliesByParent.get(parent) ?? [];
    list.push(item);
    repliesByParent.set(parent, list);
  }
  return { roots, repliesByParent };
}
