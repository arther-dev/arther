/**
 * G4.6 — multi-select set algebra for the block editor. Pure helpers the editor
 * composes over its `selectedIds` set so the modifier-click rules (⌘/Ctrl toggle,
 * Shift range) are unit-testable without a DOM. All operate on block ids; the
 * editor owns the React state and the anchor.
 */

/** Toggle a block id in or out of the selection (⌘/Ctrl-click). */
export function toggleSelection(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * The contiguous range of ids between `anchorId` and `targetId` in document
 * order (Shift-click). Order-independent: selecting up or down yields the same
 * inclusive span. Unknown ids yield an empty set (the editor falls back to a
 * single selection in that case).
 */
export function rangeSelection(
  orderedIds: readonly string[],
  anchorId: string,
  targetId: string,
): Set<string> {
  const from = orderedIds.indexOf(anchorId);
  const to = orderedIds.indexOf(targetId);
  if (from < 0 || to < 0) return new Set();
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return new Set(orderedIds.slice(lo, hi + 1));
}
