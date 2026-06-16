/**
 * G6.6 — pre-commit impact ("this affects N documents / M blocks"). Before a
 * spec field's global value is changed, the author sees the blast radius: how
 * many documents cite the field (via `block_spec_references`) and how many
 * blocks within them. Pure — the DB supplies the counts (the indexed read over
 * `block_spec_references`); this shapes the human-facing summary the editor's
 * confirm prompt shows. Informational, not a gate: it makes a wide-reaching
 * value change a deliberate act, never blocks it.
 */
export interface FieldChangeImpact {
  /** Distinct (non-archived) documents that cite the field. */
  documentCount: number;
  /** Distinct blocks across those documents that cite the field. */
  blockCount: number;
  /** A few affected document titles for context (capped); the remainder is `more`. */
  documentTitles: string[];
  /** Affected documents beyond the titles listed. */
  more: number;
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** True when changing the value ripples into at least one document. */
export function fieldChangeHasImpact(impact: FieldChangeImpact): boolean {
  return impact.documentCount > 0;
}

/** "This change affects 3 documents (5 blocks)." — empty string when no impact. */
export function describeFieldChangeImpact(impact: FieldChangeImpact): string {
  if (impact.documentCount === 0) return '';
  return `This change affects ${plural(impact.documentCount, 'document')} (${plural(
    impact.blockCount,
    'block',
  )}).`;
}

/** "Servo A, Inverter X +2 more" — the affected-document context line, or ''. */
export function listImpactedDocuments(impact: FieldChangeImpact): string {
  if (impact.documentTitles.length === 0) return '';
  const suffix = impact.more > 0 ? ` +${impact.more} more` : '';
  return `${impact.documentTitles.join(', ')}${suffix}`;
}
