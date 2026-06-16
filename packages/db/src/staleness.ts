import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlockId, DocumentId, SpecFieldId } from '@arther/types';

/**
 * G6.1 — the stale spec references for one document: block→field citations whose
 * anchored `field_version_id` is no longer the field's current version (the
 * field's value moved on since generation). Reads under RLS (members see their
 * workspace's documents). The full two-speed propagation + owner routing (G6.2/
 * G6.3) builds on this read; here it powers the "spec values changed" banner.
 */
export interface StaleReference {
  blockId: BlockId;
  fieldId: SpecFieldId;
  fieldName: string;
  category: string;
}

export async function listStaleReferencesForDocument(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<StaleReference[]> {
  const { data, error } = await client
    .from('block_spec_references')
    .select('block_id, field_id, field_version_id, spec_fields!inner(name, category, current_version_id)')
    .eq('document_id', documentId);
  if (error) throw new Error(`listStaleReferencesForDocument: ${error.message}`);

  const stale: StaleReference[] = [];
  for (const row of (data ?? []) as Array<{
    block_id: string;
    field_id: string;
    field_version_id: string;
    spec_fields:
      | { name: string; category: string; current_version_id: string | null }
      | Array<{ name: string; category: string; current_version_id: string | null }>;
  }>) {
    const field = Array.isArray(row.spec_fields) ? row.spec_fields[0] : row.spec_fields;
    if (field?.current_version_id && field.current_version_id !== row.field_version_id) {
      stale.push({
        blockId: row.block_id as BlockId,
        fieldId: row.field_id as SpecFieldId,
        fieldName: field.name,
        category: field.category,
      });
    }
  }
  return stale;
}

/**
 * G7.3 — the *brief* analog of staleness: block→brief references whose captured
 * `content_snapshot` no longer matches the fragment's current content (the brief
 * fragment was edited since generation). A light "brief updated" signal, distinct
 * from spec-value urgency. Reads under RLS. PostgREST can't join the two tables on
 * `(brief_id, fragment_key)`, so it compares the snapshot to the current content here.
 */
export interface StaleBriefReference {
  blockId: BlockId;
  fragmentKey: string;
}

export async function listStaleBriefReferencesForDocument(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<StaleBriefReference[]> {
  const { data, error } = await client
    .from('block_brief_references')
    .select('block_id, brief_id, fragment_key, content_snapshot')
    .eq('document_id', documentId);
  if (error) throw new Error(`listStaleBriefReferencesForDocument: ${error.message}`);

  const rows = (data ?? []) as Array<{
    block_id: string;
    brief_id: string;
    fragment_key: string;
    content_snapshot: string | null;
  }>;
  if (rows.length === 0) return [];

  const briefIds = [...new Set(rows.map((r) => r.brief_id))];
  const { data: frags, error: fe } = await client
    .from('brief_fragments')
    .select('brief_id, key, content')
    .in('brief_id', briefIds);
  if (fe) throw new Error(`listStaleBriefReferencesForDocument: ${fe.message}`);

  const currentByKey = new Map(
    (frags ?? []).map((f) => [`${f.brief_id as string}:${f.key as string}`, (f.content as string) ?? '']),
  );

  const stale: StaleBriefReference[] = [];
  for (const r of rows) {
    const current = currentByKey.get(`${r.brief_id}:${r.fragment_key}`);
    // Stale when the fragment was edited since generation (snapshot ≠ current).
    if (current !== undefined && current !== (r.content_snapshot ?? '')) {
      stale.push({ blockId: r.block_id as BlockId, fragmentKey: r.fragment_key });
    }
  }
  return stale;
}
