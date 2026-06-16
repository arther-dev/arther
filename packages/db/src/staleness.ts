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
