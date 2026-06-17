import type { SupabaseClient } from '@supabase/supabase-js';
import { attributeSections, blockContentSchema } from '@arther/types';
import { orphanBlockThreads } from './comments';
import type {
  BlockContent,
  BlockId,
  BlockType,
  DocumentId,
  FieldVersionId,
  ProductId,
  SpecFieldId,
  UserId,
  WorkspaceId,
} from '@arther/types';

/**
 * G7.1 — block regeneration data layer. Loads the context the generator needs to
 * rewrite a single block against the current spec graph (its product, the
 * section it sits in, its current prose), and applies the regenerated result:
 * the block's content + its `block_spec_references` (the staleness anchors) are
 * replaced together so a regenerated block re-anchors to the field versions it
 * now cites. Both run under RLS — editor-write on `blocks` / `block_spec_references`
 * (the policies the G3 `documents-blocks` probe already covers).
 */
export interface BlockRegenContext {
  blockId: BlockId;
  workspaceId: WorkspaceId;
  documentId: DocumentId;
  productId: ProductId;
  blockType: BlockType;
  /** The enclosing section's title (nearest preceding section_header). */
  sectionName: string;
  /** The block's current plain text — context for the rewrite. */
  currentText: string;
}

export async function loadBlockRegenContext(
  client: SupabaseClient,
  blockId: BlockId,
): Promise<BlockRegenContext | null> {
  const { data: block, error } = await client
    .from('blocks')
    .select('id, workspace_id, document_id, revision_id, type, text_content')
    .eq('id', blockId)
    .maybeSingle();
  if (error) throw new Error(`loadBlockRegenContext: ${error.message}`);
  if (!block) return null;

  const { data: doc, error: docErr } = await client
    .from('documents')
    .select('product_id')
    .eq('id', block.document_id)
    .maybeSingle();
  if (docErr) throw new Error(`loadBlockRegenContext: ${docErr.message}`);
  if (!doc) return null;

  // Section attribution = nearest preceding section_header (reuses the G6.2 pure
  // helper so the editor, propagation, and regeneration agree on a block's section).
  const { data: rows, error: rowsErr } = await client
    .from('blocks')
    .select('id, content')
    .eq('revision_id', block.revision_id)
    .order('display_order', { ascending: true });
  if (rowsErr) throw new Error(`loadBlockRegenContext: ${rowsErr.message}`);
  const sections = attributeSections(
    (rows ?? []).map((r) => ({ id: r.id as string, content: r.content as BlockContent })),
  );

  return {
    blockId,
    workspaceId: block.workspace_id as WorkspaceId,
    documentId: block.document_id as DocumentId,
    productId: doc.product_id as ProductId,
    blockType: block.type as BlockType,
    sectionName: sections.get(blockId) ?? 'Document',
    currentText: (block.text_content as string | null) ?? '',
  };
}

/**
 * Replace a block's content and re-anchor its spec references in one sequence:
 * clear the old `block_spec_references`, write the new content, then insert the
 * fresh references (resolved to current field versions by the caller). Not a
 * single transaction — acceptable for an authoring action (the createDocument
 * precedent); the references and content are the regenerated block's, so an
 * interrupted apply leaves a coherent (if un-re-anchored) block.
 */
export async function applyBlockRegeneration(
  client: SupabaseClient,
  input: {
    blockId: BlockId;
    documentId: DocumentId;
    workspaceId: WorkspaceId;
    content: BlockContent;
    textContent: string | null;
    refs: { fieldId: SpecFieldId; fieldVersionId: FieldVersionId }[];
    userId: UserId;
  },
): Promise<void> {
  const content = blockContentSchema.parse(input.content);

  const cleared = await client
    .from('block_spec_references')
    .delete()
    .eq('block_id', input.blockId);
  if (cleared.error) throw new Error(`applyBlockRegeneration(clear refs): ${cleared.error.message}`);

  const updated = await client
    .from('blocks')
    .update({
      content,
      text_content: input.textContent,
      last_edited_by: input.userId,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', input.blockId);
  if (updated.error) throw new Error(`applyBlockRegeneration(update block): ${updated.error.message}`);

  if (input.refs.length > 0) {
    const inserted = await client.from('block_spec_references').insert(
      input.refs.map((r) => ({
        workspace_id: input.workspaceId,
        block_id: input.blockId,
        document_id: input.documentId,
        field_id: r.fieldId,
        field_version_id: r.fieldVersionId,
        reference_type: 'generated' as const,
      })),
    );
    if (inserted.error) throw new Error(`applyBlockRegeneration(insert refs): ${inserted.error.message}`);
  }

  // C2.3 — the regenerated prose may differ substantially, so no anchor on the
  // old block is safe to keep: orphan its open comment threads (collab spec §7.5).
  await orphanBlockThreads(client, input.blockId, 'block_regenerated');
}
