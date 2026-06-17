import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DocumentId,
  DocumentRevisionId,
  PublishedSnapshotId,
  UserId,
} from '@arther/types';
import { rpcError } from './errors';
import { scopedServiceQuery, type WorkspaceScope } from './guard';

/**
 * C4 — published snapshots (migration 0008/0021). `publishDocument` freezes an
 * approved revision into an immutable, versioned snapshot via the atomic
 * `publish_document` RPC (snapshot write + state flip). Service-role only — the
 * publish pipeline is the sole writer (a JWT client must never forge a
 * publication); the app authorizes `doc.publish` + document ownership first.
 */

export interface PublishedSnapshotRow {
  id: PublishedSnapshotId;
  document_id: DocumentId;
  version: string;
  pdf_ready: boolean;
  archived_at: string | null;
  published_at: string;
  published_by: UserId | null;
}

const SNAPSHOT_COLUMNS =
  'id, document_id, version, pdf_ready, archived_at, published_at, published_by';

export async function publishDocument(
  service: SupabaseClient,
  scope: WorkspaceScope,
  input: {
    revisionId: DocumentRevisionId;
    publishedBy: UserId;
    /** The resolved BlockContent[] frozen into the snapshot. */
    blockTree: unknown[];
    /** The frozen spec-field resolution map the renderer reads (no live lookups). */
    resolutionManifest: unknown;
    searchText: string;
  },
): Promise<PublishedSnapshotId> {
  return scopedServiceQuery(scope, async () => {
    const { data, error } = await service.rpc('publish_document', {
      p_revision_id: input.revisionId,
      p_published_by: input.publishedBy,
      p_block_tree: input.blockTree,
      p_resolution_manifest: input.resolutionManifest,
      p_search_text: input.searchText,
    });
    if (error) throw rpcError('publishDocument', error);
    return data as PublishedSnapshotId;
  });
}

/** Published snapshots for a document, newest first (member read, RLS). */
export async function listSnapshotsForDocument(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<PublishedSnapshotRow[]> {
  const { data, error } = await client
    .from('published_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .eq('document_id', documentId)
    .order('published_at', { ascending: false });
  if (error) throw new Error(`listSnapshotsForDocument: ${error.message}`);
  return (data ?? []) as PublishedSnapshotRow[];
}
