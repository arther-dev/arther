import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseMergeConflictVersions,
  type DocumentId,
  type GenerationRunId,
  type MergeConflictResolution,
  type MergeConflictVersionRef,
  type UserId,
} from '@arther/types';
import { scopedServiceQuery, type WorkspaceScope } from './guard';

/**
 * V.6 — the variant merge-conflict ledger (migration 0029). The V.5 generation
 * task records the conflicts its merge couldn't auto-resolve (service role); the
 * author lists + resolves them under their JWT (member-read / editor-write RLS);
 * the publish path counts open BLOCKING conflicts to gate publication.
 */

export interface MergeConflictRow {
  id: string;
  documentId: DocumentId;
  sectionName: string;
  position: number;
  versions: MergeConflictVersionRef[];
  status: 'open' | 'resolved';
  blocking: boolean;
  resolution: MergeConflictResolution | null;
  createdAt: string;
  resolvedAt: string | null;
}

const COLUMNS =
  'id, document_id, section_name, position, versions, status, blocking, resolution, created_at, resolved_at';

function mapRow(r: Record<string, unknown>): MergeConflictRow {
  return {
    id: r.id as string,
    documentId: r.document_id as DocumentId,
    sectionName: (r.section_name as string) ?? '',
    position: (r.position as number) ?? 0,
    versions: parseMergeConflictVersions(r.versions),
    status: r.status as 'open' | 'resolved',
    blocking: Boolean(r.blocking),
    resolution: (r.resolution as MergeConflictResolution | null) ?? null,
    createdAt: r.created_at as string,
    resolvedAt: (r.resolved_at as string | null) ?? null,
  };
}

export interface NewMergeConflict {
  documentId: DocumentId;
  generationRunId?: GenerationRunId | null;
  sectionName: string;
  position: number;
  versions: MergeConflictVersionRef[];
  /** Path B (a manually-edited block) blocks publish; Path A (fresh AI prose) doesn't. */
  blocking?: boolean;
  createdBy: UserId;
}

/** Service-role insert of the conflicts a variant merge produced (V.5 task). */
export async function recordMergeConflicts(
  service: SupabaseClient,
  scope: WorkspaceScope,
  conflicts: ReadonlyArray<NewMergeConflict>,
): Promise<number> {
  if (conflicts.length === 0) return 0;
  return scopedServiceQuery(scope, async () => {
    const rows = conflicts.map((c) => ({
      workspace_id: scope.workspaceId,
      document_id: c.documentId,
      generation_run_id: c.generationRunId ?? null,
      section_name: c.sectionName,
      position: c.position,
      versions: c.versions.map((v) => ({ variant_id: v.variantId, block_id: v.blockId })),
      blocking: c.blocking ?? false,
      created_by: c.createdBy,
    }));
    const { error } = await service.from('block_merge_conflicts').insert(rows);
    if (error) throw new Error(`recordMergeConflicts: ${error.message}`);
    return rows.length;
  });
}

/** A document's merge conflicts (member read, RLS), oldest first; optionally filtered. */
export async function listMergeConflicts(
  client: SupabaseClient,
  documentId: DocumentId,
  opts?: { status?: 'open' | 'resolved' },
): Promise<MergeConflictRow[]> {
  let query = client
    .from('block_merge_conflicts')
    .select(COLUMNS)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });
  if (opts?.status) query = query.eq('status', opts.status);
  const { data, error } = await query;
  if (error) throw new Error(`listMergeConflicts: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** Open BLOCKING conflicts for a document — the publish gate (0 = publishable). */
export async function countOpenBlockingMergeConflicts(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<number> {
  const { count, error } = await client
    .from('block_merge_conflicts')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .eq('status', 'open')
    .eq('blocking', true);
  if (error) throw new Error(`countOpenBlockingMergeConflicts: ${error.message}`);
  return count ?? 0;
}

/**
 * Resolve one open conflict (editor; RLS). Idempotent on the `status = 'open'`
 * guard, so a double-submit is a no-op. The per-variant block visibility a
 * resolution implies (e.g. `use_variant`) is applied by the caller via
 * `setBlockVariantScope` before this closes the record.
 */
export async function resolveMergeConflict(
  client: SupabaseClient,
  input: { conflictId: string; documentId: DocumentId; resolution: MergeConflictResolution; userId: UserId },
): Promise<void> {
  const { error } = await client
    .from('block_merge_conflicts')
    .update({
      status: 'resolved',
      resolution: input.resolution,
      resolved_by: input.userId,
      resolved_at: new Date().toISOString(),
      updated_by: input.userId,
    })
    .eq('id', input.conflictId)
    .eq('document_id', input.documentId) // tie the resolve to the document the caller is acting on
    .eq('status', 'open');
  if (error) throw new Error(`resolveMergeConflict: ${error.message}`);
}
