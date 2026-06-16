import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlockId, BriefEntityType, DocumentId, UserId } from '@arther/types';

/**
 * G7.2 — the fill-offer's read + clear over the G2.7 placeholder spine.
 * `listPlaceholdersForFragment` finds the placeholder blocks waiting on a brief
 * fragment (so saving it can offer to fill them); `clearPlaceholder` removes the
 * placeholder marker once a block is filled (drops the reference and re-tags the
 * block's source so it no longer reads as a placeholder). Both under RLS
 * (editor-write on `placeholder_brief_references` / `blocks`).
 */
export interface PlaceholderForFill {
  blockId: BlockId;
  documentId: DocumentId;
}

export async function listPlaceholdersForFragment(
  client: SupabaseClient,
  entityType: BriefEntityType,
  entityId: string,
  fragmentKey: string,
): Promise<PlaceholderForFill[]> {
  const { data, error } = await client
    .from('placeholder_brief_references')
    .select('block_id, document_id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('fragment_key', fragmentKey);
  if (error) throw new Error(`listPlaceholdersForFragment: ${error.message}`);
  return (data ?? []).map((r) => ({
    blockId: r.block_id as BlockId,
    documentId: r.document_id as DocumentId,
  }));
}

export async function clearPlaceholder(
  client: SupabaseClient,
  blockId: BlockId,
  userId: UserId,
): Promise<void> {
  const cleared = await client.from('placeholder_brief_references').delete().eq('block_id', blockId);
  if (cleared.error) throw new Error(`clearPlaceholder(ref): ${cleared.error.message}`);

  const retagged = await client
    .from('blocks')
    .update({ source: 'brief', last_edited_by: userId, last_edited_at: new Date().toISOString() })
    .eq('id', blockId);
  if (retagged.error) throw new Error(`clearPlaceholder(block): ${retagged.error.message}`);
}
