/**
 * Circular-reference detection for reference fields (F5.9, spec DB §4.8):
 * component A → B → A is blocked at save time. Pure graph traversal over the
 * existing reference edges; the caller supplies edges and the candidate.
 */
export interface ReferenceEdge {
  /** Component owning the reference field. */
  from: string;
  /** Component the field points at. */
  to: string;
}

export function wouldCreateReferenceCycle(
  existing: readonly ReferenceEdge[],
  candidate: ReferenceEdge,
): boolean {
  if (candidate.from === candidate.to) return true;
  const adjacency = new Map<string, string[]>();
  for (const e of [...existing, candidate]) {
    const list = adjacency.get(e.from);
    if (list) list.push(e.to);
    else adjacency.set(e.from, [e.to]);
  }
  // A cycle through the candidate exists iff candidate.from is reachable
  // from candidate.to.
  const seen = new Set<string>();
  const stack = [candidate.to];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === candidate.from) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}
