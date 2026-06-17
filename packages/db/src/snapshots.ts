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

/**
 * C4.6 — unpublish = archive. Take a document off the public portal by archiving
 * all of its currently-live snapshots; rows are never deleted (history is kept
 * for restore/audit). Runs under the caller's JWT, so the 0008 RLS UPDATE policy
 * gates it to owner/admin, the freeze guard permits the `archived_*` change, and
 * the audit trigger records the real actor (`auth.uid()`) + a `snapshot.archived`
 * row per version. Returns how many snapshots were archived (0 = nothing live).
 */
export async function archiveDocumentSnapshots(
  client: SupabaseClient,
  input: { documentId: DocumentId; userId: UserId },
): Promise<number> {
  const { data, error } = await client
    .from('published_snapshots')
    .update({ archived_at: new Date().toISOString(), archived_by: input.userId })
    .eq('document_id', input.documentId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`archiveDocumentSnapshots: ${error.message}`);
  return (data ?? []).length;
}

/**
 * C4.6 — restore a document to the portal: un-archive its most recent snapshot
 * (the portal serves the latest non-archived version, so this republishes the
 * newest publication; older versions stay archived). Same RLS/audit path as
 * archiving (logs `snapshot.restored`). Returns the restored version, or null if
 * the document has never been published.
 */
export async function restoreLatestSnapshot(
  client: SupabaseClient,
  input: { documentId: DocumentId; userId: UserId },
): Promise<string | null> {
  const { data: latest, error: selErr } = await client
    .from('published_snapshots')
    .select('id, version')
    .eq('document_id', input.documentId)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(`restoreLatestSnapshot: ${selErr.message}`);
  if (!latest) return null;

  const { error: updErr } = await client
    .from('published_snapshots')
    .update({ archived_at: null, archived_by: null })
    .eq('id', latest.id as PublishedSnapshotId);
  if (updErr) throw new Error(`restoreLatestSnapshot: ${updErr.message}`);
  return latest.version as string;
}
