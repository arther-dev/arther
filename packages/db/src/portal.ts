import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlockContent,
  DocumentId,
  ProductId,
  SpecFieldResolution,
  WorkspaceId,
} from '@arther/types';

/**
 * C6 — the public portal data path. The portal serves anonymous visitors, so it
 * reads `published_snapshots` (which is member-RLS) through the SERVICE client
 * (BYPASSRLS) and constrains every query itself: a single workspace (resolved
 * from the host/slug), PUBLIC access only, and non-archived snapshots. It never
 * reads drafts, the spec database, or any other workspace — only frozen, public
 * publications. (Magic-link gated access + custom-domain host resolution are C6
 * follow-ups; this path serves public docs by workspace slug.)
 */

export interface PortalWorkspace {
  id: WorkspaceId;
  name: string;
  slug: string;
}

export interface PortalDocumentListing {
  documentId: DocumentId;
  documentSlug: string;
  title: string;
  productId: ProductId;
  productName: string;
  version: string;
  publishedAt: string;
}

export interface PortalDocument {
  title: string;
  productName: string;
  version: string;
  blockTree: BlockContent[];
  resolutionManifest: SpecFieldResolution;
}

function one<T>(v: T | T[]): T {
  return Array.isArray(v) ? v[0]! : v;
}

/** Only public snapshots are portal-visible (gated access is a C6 follow-up). */
function isPublic(accessConfig: unknown): boolean {
  if (!accessConfig || typeof accessConfig !== 'object') return true;
  const access = (accessConfig as { access?: string }).access;
  return access === undefined || access === 'public';
}

/** Resolve a workspace by its (immutable) portal slug. */
export async function getPortalWorkspace(
  service: SupabaseClient,
  slug: string,
): Promise<PortalWorkspace | null> {
  const { data, error } = await service
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`getPortalWorkspace: ${error.message}`);
  return (data as PortalWorkspace) ?? null;
}

/** The latest non-archived public publication per document in a workspace. */
export async function listPortalPublishedDocuments(
  service: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<PortalDocumentListing[]> {
  const { data, error } = await service
    .from('published_snapshots')
    .select(
      'document_id, product_id, version, published_at, access_config, documents!inner(title, slug, archived_at), products!inner(name)',
    )
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('published_at', { ascending: false });
  if (error) throw new Error(`listPortalPublishedDocuments: ${error.message}`);

  const seen = new Set<string>();
  const out: PortalDocumentListing[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (!isPublic(row.access_config)) continue;
    const doc = one(row.documents as { title: string; slug: string; archived_at: string | null });
    if (doc.archived_at) continue;
    const documentId = row.document_id as string;
    if (seen.has(documentId)) continue; // ordered desc → first seen is latest
    seen.add(documentId);
    out.push({
      documentId: documentId as DocumentId,
      documentSlug: doc.slug,
      title: doc.title,
      productId: row.product_id as ProductId,
      productName: one(row.products as { name: string }).name,
      version: row.version as string,
      publishedAt: row.published_at as string,
    });
  }
  return out;
}

/** A single published document — the latest non-archived public snapshot, or a
 *  specific version. Returns the frozen, self-contained render payload. */
export async function getPortalDocument(
  service: SupabaseClient,
  input: { workspaceId: WorkspaceId; productId: string; documentSlug: string; version?: string },
): Promise<PortalDocument | null> {
  const { data: doc, error: docErr } = await service
    .from('documents')
    .select('id, title, products!inner(name)')
    .eq('workspace_id', input.workspaceId)
    .eq('product_id', input.productId)
    .eq('slug', input.documentSlug)
    .is('archived_at', null)
    .maybeSingle();
  if (docErr) throw new Error(`getPortalDocument.document: ${docErr.message}`);
  if (!doc) return null;

  let query = service
    .from('published_snapshots')
    .select('version, block_tree, resolution_manifest, access_config')
    .eq('workspace_id', input.workspaceId)
    .eq('document_id', doc.id as string)
    .is('archived_at', null);
  if (input.version) query = query.eq('version', input.version);
  const { data: snaps, error: snapErr } = await query
    .order('published_at', { ascending: false })
    .limit(1);
  if (snapErr) throw new Error(`getPortalDocument.snapshot: ${snapErr.message}`);

  const snap = (snaps ?? [])[0] as
    | { version: string; block_tree: unknown; resolution_manifest: unknown; access_config: unknown }
    | undefined;
  if (!snap || !isPublic(snap.access_config)) return null;

  return {
    title: doc.title as string,
    productName: one(doc.products as unknown as { name: string } | { name: string }[]).name,
    version: snap.version,
    blockTree: (snap.block_tree as BlockContent[]) ?? [],
    resolutionManifest: (snap.resolution_manifest as SpecFieldResolution) ?? {},
  };
}
