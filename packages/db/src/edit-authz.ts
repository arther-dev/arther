import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlockId,
  DocumentId,
  DocumentRevisionId,
  DocumentState,
  DocumentTypeId,
  WorkspaceId,
} from '@arther/types';

/**
 * C1.4 / C0.3 — the lifecycle context a document mutation needs to authorize
 * against the document state (migration 0005/0019). Block edits are Draft-only
 * for editors; in Review only an assigned approver may make minor corrections
 * (spec §4.3). These resolve the working revision's state + the Document Type
 * (the approval-role key) for a block or a revision, under RLS (member read).
 *
 * Plain single-table reads (no PostgREST embed): this is an authoring path, not
 * hot, and certainty matters — the edit-lock has no provisioned-data test.
 */
export interface EditContext {
  revisionId: DocumentRevisionId;
  documentId: DocumentId;
  workspaceId: WorkspaceId;
  documentTypeId: DocumentTypeId;
  state: DocumentState;
}

/** The edit context for a revision: its state + the document's Document Type. */
export async function loadEditContextForRevision(
  client: SupabaseClient,
  revisionId: DocumentRevisionId,
): Promise<EditContext | null> {
  const { data: rev, error } = await client
    .from('document_revisions')
    .select('id, document_id, workspace_id, state')
    .eq('id', revisionId)
    .maybeSingle();
  if (error) throw new Error(`loadEditContextForRevision: ${error.message}`);
  if (!rev) return null;

  const { data: doc, error: docErr } = await client
    .from('documents')
    .select('document_type_id')
    .eq('id', rev.document_id)
    .maybeSingle();
  if (docErr) throw new Error(`loadEditContextForRevision.document: ${docErr.message}`);
  if (!doc) return null;

  return {
    revisionId: rev.id as DocumentRevisionId,
    documentId: rev.document_id as DocumentId,
    workspaceId: rev.workspace_id as WorkspaceId,
    state: rev.state as DocumentState,
    documentTypeId: doc.document_type_id as DocumentTypeId,
  };
}

/** The edit context for the block being mutated (resolves its revision). */
export async function loadEditContextForBlock(
  client: SupabaseClient,
  blockId: BlockId,
): Promise<EditContext | null> {
  const { data: block, error } = await client
    .from('blocks')
    .select('revision_id')
    .eq('id', blockId)
    .maybeSingle();
  if (error) throw new Error(`loadEditContextForBlock: ${error.message}`);
  if (!block) return null;
  return loadEditContextForRevision(client, block.revision_id as DocumentRevisionId);
}
