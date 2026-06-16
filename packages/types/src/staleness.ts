/**
 * G6.1 — staleness summary (Smart Spec Tracking, architecture §5.2). A document's
 * block→field references each anchor the field version they were generated from;
 * when a field's value moves on, those references go stale. This reduces the
 * stale-reference list to what a banner shows: the distinct changed fields and
 * the affected blocks. Pure — the DB supplies the stale refs (the indexed join
 * over `block_spec_references`), this counts them.
 */
export interface StaleRef {
  blockId: string;
  fieldName: string;
}

export interface StalenessSummary {
  /** Distinct field names that changed since generation, in first-seen order. */
  fields: string[];
  /** Distinct affected block ids. */
  blockIds: string[];
  fieldCount: number;
  blockCount: number;
}

export function summarizeStaleness(refs: ReadonlyArray<StaleRef>): StalenessSummary {
  const fields = [...new Set(refs.map((r) => r.fieldName))];
  const blockIds = [...new Set(refs.map((r) => r.blockId))];
  return { fields, blockIds, fieldCount: fields.length, blockCount: blockIds.length };
}
