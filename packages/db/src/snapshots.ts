import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DocumentId,
  DocumentRevisionId,
  PublishedSnapshotId,
  UserId,
  VariantId,
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
  /** V.9 — null for the base publication; a variant id for a per-variant page. */
  variant_id: VariantId | null;
  version: string;
  pdf_ready: boolean;
  archived_at: string | null;
  published_at: string;
  published_by: UserId | null;
  /** C7.1 — the access tier (`{"access":"public"|"link"}`); default public. */
  access_config: unknown;
}

const SNAPSHOT_COLUMNS =
  'id, document_id, variant_id, version, pdf_ready, archived_at, published_at, published_by, access_config';

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
    /**
     * V.9 — set for a per-variant publication: freezes the variant's
     * delta-resolved block tree as an independent portal page (variant_id stamped,
     * versioned per variant line). null/omitted = the base document publication.
     */
    variantId?: VariantId | null;
  },
): Promise<PublishedSnapshotId> {
  return scopedServiceQuery(scope, async () => {
    const { data, error } = await service.rpc('publish_document', {
      p_revision_id: input.revisionId,
      p_published_by: input.publishedBy,
      p_block_tree: input.blockTree,
      p_resolution_manifest: input.resolutionManifest,
      p_search_text: input.searchText,
      p_variant_id: input.variantId ?? null,
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
 * its currently-live BASE snapshots; rows are never deleted (history is kept for
 * restore/audit). V.9 — scoped to the base line (`variant_id IS NULL`) so taking
 * the base document down never collaterally archives independently-published
 * variant pages (those have their own `archiveVariantSnapshots`). Runs under the
 * caller's JWT, so the 0008 RLS UPDATE policy gates it to owner/admin, the freeze
 * guard permits the `archived_*` change, and the audit trigger records the real
 * actor. Returns how many snapshots were archived (0 = nothing live).
 */
export async function archiveDocumentSnapshots(
  client: SupabaseClient,
  input: { documentId: DocumentId; userId: UserId },
): Promise<number> {
  const { data, error } = await client
    .from('published_snapshots')
    .update({ archived_at: new Date().toISOString(), archived_by: input.userId })
    .eq('document_id', input.documentId)
    .is('variant_id', null)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`archiveDocumentSnapshots: ${error.message}`);
  return (data ?? []).length;
}

/**
 * V.9 — whether a variant has ANY published snapshot (live or archived). A
 * published snapshot is frozen, permanent history and the `snapshots_variant_fk`
 * is ON DELETE RESTRICT (migration 0028), so a variant that has ever published
 * can't be hard-deleted. The app checks this to refuse the delete with a clear
 * message instead of surfacing a raw foreign-key error. Member-readable (RLS).
 */
export async function variantHasSnapshots(
  client: SupabaseClient,
  variantId: VariantId,
): Promise<boolean> {
  const { data, error } = await client
    .from('published_snapshots')
    .select('id')
    .eq('variant_id', variantId)
    .limit(1);
  if (error) throw new Error(`variantHasSnapshots: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * V.9 — unpublish a single variant: archive that variant's live snapshots only,
 * leaving the base publication and sibling variants untouched (spec §4.5,
 * "publishing variant A does not publish variant B" — the inverse holds too).
 * Same caller-JWT RLS (owner/admin) + freeze-guard (archived_* permitted) + audit
 * path as `archiveDocumentSnapshots`. Returns how many were archived (0 = the
 * variant wasn't live).
 */
export async function archiveVariantSnapshots(
  client: SupabaseClient,
  input: { documentId: DocumentId; variantId: VariantId; userId: UserId },
): Promise<number> {
  const { data, error } = await client
    .from('published_snapshots')
    .update({ archived_at: new Date().toISOString(), archived_by: input.userId })
    .eq('document_id', input.documentId)
    .eq('variant_id', input.variantId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`archiveVariantSnapshots: ${error.message}`);
  return (data ?? []).length;
}

/**
 * C4.6 — restore a document to the portal: un-archive its most recent BASE
 * snapshot (the portal serves the latest non-archived version, so this
 * republishes the newest base publication; older versions stay archived). V.9 —
 * scoped to the base line (`variant_id IS NULL`) so restore can't accidentally
 * un-archive a more-recently-published variant snapshot instead of the base.
 * Same RLS/audit path as archiving (logs `snapshot.restored`). Returns the
 * restored version, or null if the base document has never been published.
 */
export async function restoreLatestSnapshot(
  client: SupabaseClient,
  input: { documentId: DocumentId; userId: UserId },
): Promise<string | null> {
  const { data: latest, error: selErr } = await client
    .from('published_snapshots')
    .select('id, version')
    .eq('document_id', input.documentId)
    .is('variant_id', null)
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
