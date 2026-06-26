import { z } from 'zod';

/**
 * V.6 — merge-conflict resolution model (Product Variants §4.8). A merge conflict
 * is unlinked prose that DIFFERS across variants (the V.5 merge has no spec field
 * to anchor on). Two paths: AI-generated conflicts are non-blocking review items;
 * a human-edited block in conflict blocks publication until resolved. This is the
 * one Zod source for the resolution enum the app and db share.
 */

export const MERGE_CONFLICT_RESOLUTIONS = [
  /** Each variant keeps its own version (the blocks stay MANUAL-scoped). */
  'keep_both',
  /** One variant's version becomes the shared block; the others are hidden. */
  'use_variant',
  /** The author wrote a single shared version by hand in the editor. */
  'shared',
  /** The block was re-generated and the variants reconciled. */
  'regenerated',
] as const;
export type MergeConflictResolution = (typeof MERGE_CONFLICT_RESOLUTIONS)[number];
export const mergeConflictResolutionSchema = z.enum(MERGE_CONFLICT_RESOLUTIONS);

export const MERGE_CONFLICT_RESOLUTION_LABELS: Record<MergeConflictResolution, string> = {
  keep_both: 'Kept both',
  use_variant: 'Used one version',
  shared: 'Wrote a shared version',
  regenerated: 'Re-generated',
};

/** One variant's version of a conflicting block, by id (the merged tree holds it). */
export interface MergeConflictVersionRef {
  variantId: string;
  blockId: string;
}

/** Parse the persisted `versions` jsonb defensively (it crosses the DB boundary). */
export function parseMergeConflictVersions(value: unknown): MergeConflictVersionRef[] {
  if (!Array.isArray(value)) return [];
  const out: MergeConflictVersionRef[] = [];
  for (const item of value) {
    if (item && typeof item === 'object') {
      const v = (item as Record<string, unknown>).variant_id ?? (item as Record<string, unknown>).variantId;
      const b = (item as Record<string, unknown>).block_id ?? (item as Record<string, unknown>).blockId;
      if (typeof v === 'string' && typeof b === 'string') out.push({ variantId: v, blockId: b });
    }
  }
  return out;
}
