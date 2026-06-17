/**
 * Move the item at `index` one step in `direction` (-1 up / +1 down), returning a
 * new array. A move that would fall off either end is a no-op (returns a copy).
 * Pure — the spec-field reorder (F6) and any other "move up/down" list share it.
 */
export function moveInList<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
