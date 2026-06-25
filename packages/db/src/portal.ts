import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isPublicAccess,
  searchSnippet,
  type BlockContent,
  type DocumentId,
  type ProductId,
  type SpecFieldResolution,
  type WorkspaceId,
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
  /** V.9 — set when this is a per-variant page; null for the base publication. */
  variant: { id: string; name: string; slug: string } | null;
}

/** V.9 — one published variant of a document, for the portal picker/switcher. */
export interface PortalVariantListing {
  variantId: string;
  name: string;
  slug: string;
  isDefault: boolean;
}

/**
 * V.9 — the variant index for a document: whether the base publication is live
 * and which variants have a live public snapshot. Drives the portal switcher
 * (shown on the base page and every variant page) + the picker.
 */
export interface DocumentVariantIndex {
  documentId: DocumentId;
  baseAvailable: boolean;
  variants: PortalVariantListing[];
}

/** C9.6 — a public document resolved to its workspace + id, for analytics metering. */
export interface PortalDocumentRef {
  workspaceId: WorkspaceId;
  documentId: DocumentId;
  version: string;
}

/** C9.3 — one public document for the portal sitemap (latest publication per doc). */
export interface SitemapEntry {
  workspaceSlug: string;
  productId: ProductId;
  documentSlug: string;
  /** V.9 — set for a per-variant canonical URL; omitted for the base document. */
  variantSlug?: string;
  publishedAt: string;
}

export interface PortalSearchHit {
  documentId: DocumentId;
  documentSlug: string;
  title: string;
  productId: ProductId;
  productName: string;
  version: string;
  snippet: string;
}

function one<T>(v: T | T[]): T {
  return Array.isArray(v) ? v[0]! : v;
}

/**
 * Only public snapshots are portal-visible anonymously; gated (`link`/allowlist)
 * snapshots are served by the magic-link path (C7), never these public queries.
 * Delegates to the one access-tier reader in `@arther/types` so the public/gated
 * decision is identical wherever it's made.
 */
function isPublic(accessConfig: unknown): boolean {
  return isPublicAccess(accessConfig);
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
    .is('variant_id', null) // V.9 — the library lists base publications; variants are reached via the document's switcher.
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
    .is('variant_id', null) // V.9 — the base page serves the no-variant publication; variant pages use getPortalVariantDocument.
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
    variant: null,
  };
}

/**
 * V.9 — a single published VARIANT page: the latest non-archived public snapshot
 * for `(document, variant)`, resolved from the variant slug. Mirrors
 * `getPortalDocument` but scopes to a specific `variant_id` (never the base, and
 * never a sibling variant). The returned payload is the frozen, self-contained
 * render payload (the variant's delta-resolved block tree + manifest), tagged
 * with the variant so the page header and switcher can name it.
 */
export async function getPortalVariantDocument(
  service: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    productId: string;
    documentSlug: string;
    variantSlug: string;
    version?: string;
  },
): Promise<PortalDocument | null> {
  const { data: doc, error: docErr } = await service
    .from('documents')
    .select('id, title, products!inner(name)')
    .eq('workspace_id', input.workspaceId)
    .eq('product_id', input.productId)
    .eq('slug', input.documentSlug)
    .is('archived_at', null)
    .maybeSingle();
  if (docErr) throw new Error(`getPortalVariantDocument.document: ${docErr.message}`);
  if (!doc) return null;

  const { data: variant, error: varErr } = await service
    .from('product_variants')
    .select('id, name, slug')
    .eq('product_id', input.productId)
    .eq('slug', input.variantSlug)
    .maybeSingle();
  if (varErr) throw new Error(`getPortalVariantDocument.variant: ${varErr.message}`);
  if (!variant) return null;

  let query = service
    .from('published_snapshots')
    .select('version, block_tree, resolution_manifest, access_config')
    .eq('workspace_id', input.workspaceId)
    .eq('document_id', doc.id as string)
    .eq('variant_id', variant.id as string)
    .is('archived_at', null);
  if (input.version) query = query.eq('version', input.version);
  const { data: snaps, error: snapErr } = await query
    .order('published_at', { ascending: false })
    .limit(1);
  if (snapErr) throw new Error(`getPortalVariantDocument.snapshot: ${snapErr.message}`);

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
    variant: { id: variant.id as string, name: variant.name as string, slug: variant.slug as string },
  };
}

/**
 * V.9 — the variant index for a document: whether the base publication is live
 * and which variants currently have a live PUBLIC snapshot (the latest snapshot
 * per variant decides, mirroring the serve path). Public-only, so a gated variant
 * is never advertised in the switcher. Returns null if the document doesn't
 * exist; an empty `variants` list means the document has no published variants.
 */
export async function listDocumentPublishedVariants(
  service: SupabaseClient,
  input: { workspaceId: WorkspaceId; productId: string; documentSlug: string },
): Promise<DocumentVariantIndex | null> {
  const { data: doc, error: docErr } = await service
    .from('documents')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('product_id', input.productId)
    .eq('slug', input.documentSlug)
    .is('archived_at', null)
    .maybeSingle();
  if (docErr) throw new Error(`listDocumentPublishedVariants.document: ${docErr.message}`);
  if (!doc) return null;
  const documentId = (doc as { id: string }).id as DocumentId;

  const { data: snaps, error: snapErr } = await service
    .from('published_snapshots')
    .select('variant_id, access_config, published_at')
    .eq('workspace_id', input.workspaceId)
    .eq('document_id', documentId)
    .is('archived_at', null)
    .order('published_at', { ascending: false });
  if (snapErr) throw new Error(`listDocumentPublishedVariants.snapshots: ${snapErr.message}`);

  let baseAvailable = false;
  const seenVariant = new Set<string>();
  const publicVariantIds = new Set<string>();
  for (const row of (snaps ?? []) as Array<{ variant_id: string | null; access_config: unknown }>) {
    if (row.variant_id == null) {
      if (isPublic(row.access_config)) baseAvailable = true;
      continue;
    }
    if (seenVariant.has(row.variant_id)) continue; // ordered desc → first seen is the latest
    seenVariant.add(row.variant_id);
    if (isPublic(row.access_config)) publicVariantIds.add(row.variant_id);
  }

  if (publicVariantIds.size === 0) {
    return { documentId, baseAvailable, variants: [] };
  }

  const { data: vrows, error: vErr } = await service
    .from('product_variants')
    .select('id, name, slug, is_default')
    .in('id', [...publicVariantIds]);
  if (vErr) throw new Error(`listDocumentPublishedVariants.variants: ${vErr.message}`);

  const variants: PortalVariantListing[] = ((vrows ?? []) as Array<Record<string, unknown>>)
    .map((v) => ({
      variantId: v.id as string,
      name: v.name as string,
      slug: v.slug as string,
      isDefault: Boolean(v.is_default),
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));

  return { documentId, baseAvailable, variants };
}

/**
 * C7.2 — the gated read: the latest non-archived snapshot for a document by id,
 * **regardless of access tier**. Used only after a magic-link session has been
 * verified (the public queries deliberately exclude gated docs), so the access
 * decision is made by the caller, not this query.
 */
export async function getGatedPortalDocument(
  service: SupabaseClient,
  documentId: DocumentId,
): Promise<PortalDocument | null> {
  const { data: doc, error: docErr } = await service
    .from('documents')
    .select('id, title, archived_at, products!inner(name)')
    .eq('id', documentId)
    .maybeSingle();
  if (docErr) throw new Error(`getGatedPortalDocument.document: ${docErr.message}`);
  if (!doc || doc.archived_at) return null;

  const { data: snaps, error: snapErr } = await service
    .from('published_snapshots')
    .select('version, block_tree, resolution_manifest')
    .eq('document_id', documentId)
    .is('variant_id', null) // V.9 — magic links are issued per base document; the gated read serves the base line.
    .is('archived_at', null)
    .order('published_at', { ascending: false })
    .limit(1);
  if (snapErr) throw new Error(`getGatedPortalDocument.snapshot: ${snapErr.message}`);

  const snap = (snaps ?? [])[0] as
    | { version: string; block_tree: unknown; resolution_manifest: unknown }
    | undefined;
  if (!snap) return null;

  return {
    title: doc.title as string,
    productName: one(doc.products as unknown as { name: string } | { name: string }[]).name,
    version: snap.version,
    blockTree: (snap.block_tree as BlockContent[]) ?? [],
    resolutionManifest: (snap.resolution_manifest as SpecFieldResolution) ?? {},
    variant: null,
  };
}

/**
 * C9.6 — resolve a portal URL's coordinates (`/{workspaceSlug}/{productId}/
 * {documentSlug}`) to a `{ workspaceId, documentId }` ref for analytics metering.
 * Returns null unless they name a real, non-archived, **public** publication —
 * so a fabricated beacon resolves to nothing and records no event (the same
 * public filter the serve path uses, never trusting client-supplied ids).
 */
export async function resolvePortalDocumentRef(
  service: SupabaseClient,
  input: {
    workspaceSlug: string;
    productId: string;
    documentSlug: string;
    version?: string;
    /** V.9 — set for a per-variant page beacon; resolves that variant's snapshot. */
    variantSlug?: string;
  },
): Promise<PortalDocumentRef | null> {
  const workspace = await getPortalWorkspace(service, input.workspaceSlug);
  if (!workspace) return null;

  const { data: doc, error: docErr } = await service
    .from('documents')
    .select('id, archived_at')
    .eq('workspace_id', workspace.id)
    .eq('product_id', input.productId)
    .eq('slug', input.documentSlug)
    .is('archived_at', null)
    .maybeSingle();
  if (docErr) throw new Error(`resolvePortalDocumentRef.document: ${docErr.message}`);
  if (!doc || (doc as { archived_at: string | null }).archived_at) return null;

  // Resolve the variant line: a named variant (by slug) or the base (variant_id IS NULL).
  let variantId: string | null = null;
  if (input.variantSlug) {
    const { data: variant, error: varErr } = await service
      .from('product_variants')
      .select('id')
      .eq('product_id', input.productId)
      .eq('slug', input.variantSlug)
      .maybeSingle();
    if (varErr) throw new Error(`resolvePortalDocumentRef.variant: ${varErr.message}`);
    if (!variant) return null;
    variantId = (variant as { id: string }).id;
  }

  let query = service
    .from('published_snapshots')
    .select('version, access_config')
    .eq('workspace_id', workspace.id)
    .eq('document_id', (doc as { id: string }).id)
    .is('archived_at', null);
  query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null);
  if (input.version) query = query.eq('version', input.version);
  const { data: snaps, error: snapErr } = await query
    .order('published_at', { ascending: false })
    .limit(1);
  if (snapErr) throw new Error(`resolvePortalDocumentRef.snapshot: ${snapErr.message}`);

  const snap = (snaps ?? [])[0] as { version: string; access_config: unknown } | undefined;
  if (!snap || !isPublic(snap.access_config)) return null;

  return {
    workspaceId: workspace.id,
    documentId: (doc as { id: string }).id as DocumentId,
    version: snap.version,
  };
}

/**
 * C6.4 — full-text search across a workspace's published documentation, over the
 * `published_snapshots.search_tsv` GIN index (the plain-text projection C4.5
 * writes). Searches **only the latest non-archived public snapshot per
 * document** (a two-step: resolve the current snapshot per document, then FTS
 * those) so superseded versions never surface.
 */
export async function searchPortalDocuments(
  service: SupabaseClient,
  workspaceId: WorkspaceId,
  query: string,
): Promise<PortalSearchHit[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  // The current (latest, non-archived, public) snapshot id per document. Search
  // covers base publications (variant_id IS NULL); variant pages are reached from
  // the document's switcher, not surfaced as separate search hits (V.9).
  const { data: all, error: e1 } = await service
    .from('published_snapshots')
    .select('id, document_id, published_at, access_config')
    .eq('workspace_id', workspaceId)
    .is('variant_id', null)
    .is('archived_at', null)
    .order('published_at', { ascending: false });
  if (e1) throw new Error(`searchPortalDocuments.latest: ${e1.message}`);

  const latest = new Map<string, string>();
  for (const row of (all ?? []) as Array<Record<string, unknown>>) {
    if (!isPublic(row.access_config)) continue;
    const docId = row.document_id as string;
    if (!latest.has(docId)) latest.set(docId, row.id as string); // ordered desc → latest first
  }
  const ids = [...latest.values()];
  if (ids.length === 0) return [];

  const { data, error } = await service
    .from('published_snapshots')
    .select(
      'document_id, product_id, version, search_text, documents!inner(title, slug, archived_at), products!inner(name)',
    )
    .in('id', ids)
    .textSearch('search_tsv', q, { type: 'websearch', config: 'english' })
    .limit(50);
  if (error) throw new Error(`searchPortalDocuments.fts: ${error.message}`);

  const hits: PortalSearchHit[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const doc = one(row.documents as { title: string; slug: string; archived_at: string | null });
    if (doc.archived_at) continue;
    hits.push({
      documentId: row.document_id as DocumentId,
      documentSlug: doc.slug,
      title: doc.title,
      productId: row.product_id as ProductId,
      productName: one(row.products as { name: string }).name,
      version: row.version as string,
      snippet: searchSnippet((row.search_text as string | null) ?? '', q),
    });
  }
  return hits;
}

/**
 * C9.3 — every public, non-archived document across the portal (latest
 * publication per document), for `sitemap.xml`. Service-role + the same public
 * filter the serve path uses, joined to the workspace slug + document slug that
 * form the public URL `/{workspaceSlug}/{productId}/{documentSlug}`.
 */
export async function listSitemapEntries(service: SupabaseClient): Promise<SitemapEntry[]> {
  const { data, error } = await service
    .from('published_snapshots')
    .select(
      'document_id, product_id, published_at, access_config, workspaces!inner(slug), documents!inner(slug, archived_at)',
    )
    .is('variant_id', null)
    .is('archived_at', null)
    .order('published_at', { ascending: false });
  if (error) throw new Error(`listSitemapEntries: ${error.message}`);

  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (!isPublic(row.access_config)) continue;
    const doc = one(row.documents as { slug: string; archived_at: string | null });
    if (doc.archived_at) continue;
    const documentId = row.document_id as string;
    if (seen.has(documentId)) continue; // ordered desc → first seen is latest
    seen.add(documentId);
    out.push({
      workspaceSlug: one(row.workspaces as { slug: string }).slug,
      productId: row.product_id as ProductId,
      documentSlug: doc.slug,
      publishedAt: row.published_at as string,
    });
  }
  return out;
}

/**
 * V.9 — every public, non-archived per-variant publication (latest per
 * (document, variant)), for the sitemap's canonical variant URLs
 * `/{workspaceSlug}/{productId}/{documentSlug}/var/{variantSlug}`. Same public
 * filter the variant serve path uses; joined to the slugs that form the URL.
 */
export async function listVariantSitemapEntries(service: SupabaseClient): Promise<SitemapEntry[]> {
  const { data, error } = await service
    .from('published_snapshots')
    .select(
      'document_id, product_id, variant_id, published_at, access_config, workspaces!inner(slug), documents!inner(slug, archived_at), product_variants!inner(slug)',
    )
    .not('variant_id', 'is', null)
    .is('archived_at', null)
    .order('published_at', { ascending: false });
  if (error) throw new Error(`listVariantSitemapEntries: ${error.message}`);

  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (!isPublic(row.access_config)) continue;
    const doc = one(row.documents as { slug: string; archived_at: string | null });
    if (doc.archived_at) continue;
    // De-dupe to the latest publication per (document, variant) line.
    const key = `${row.document_id as string}:${row.variant_id as string}`;
    if (seen.has(key)) continue; // ordered desc → first seen is latest
    seen.add(key);
    out.push({
      workspaceSlug: one(row.workspaces as { slug: string }).slug,
      productId: row.product_id as ProductId,
      documentSlug: doc.slug,
      variantSlug: one(row.product_variants as { slug: string }).slug,
      publishedAt: row.published_at as string,
    });
  }
  return out;
}
