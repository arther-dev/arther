/**
 * G4.7 — workspace search helpers (pure). The DB layer runs the FTS / name
 * matches under RLS; these shape the results for display without a round-trip.
 */

/**
 * A short snippet of `text` centred on the first occurrence of the query's lead
 * term, with ellipses where it's clipped — the preview under a document hit.
 * Whitespace is collapsed; no match (or short text) just truncates the head.
 */
export function searchSnippet(text: string, query: string, max = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const term = query.trim().split(/\s+/)[0] ?? '';
  const idx = term ? clean.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (idx < 0) return `${clean.slice(0, max).trimEnd()}…`;
  const start = Math.max(0, idx - Math.floor(max / 3));
  const end = Math.min(clean.length, start + max);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}
