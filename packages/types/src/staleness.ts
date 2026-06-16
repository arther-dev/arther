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

/**
 * G7.3 — the *brief* analog: block→brief references whose fragment content was
 * edited since generation. A light "brief updated" signal, distinct from spec
 * urgency — the surrounding prose may want a refresh, but no value is wrong.
 * Pure; the DB supplies the stale brief refs (snapshot ≠ current content).
 */
export interface StaleBriefRef {
  blockId: string;
  fragmentKey: string;
}

export interface BriefStalenessSummary {
  /** Distinct brief fragment keys edited since generation, in first-seen order. */
  keys: string[];
  /** Distinct affected block ids. */
  blockIds: string[];
  keyCount: number;
  blockCount: number;
}

export function summarizeBriefStaleness(refs: ReadonlyArray<StaleBriefRef>): BriefStalenessSummary {
  const keys = [...new Set(refs.map((r) => r.fragmentKey))];
  const blockIds = [...new Set(refs.map((r) => r.blockId))];
  return { keys, blockIds, keyCount: keys.length, blockCount: blockIds.length };
}
