import type { MetadataRoute } from 'next';
import { listSitemapEntries, listVariantSitemapEntries } from '@arther/db';
import { getPortalDb } from '../lib/portal-db';
import { portalBaseUrl, documentPath, variantPath } from '../lib/portal-url';

/**
 * C9.3 / V.9 — `sitemap.xml` over every public, non-archived publication (latest
 * per doc, and latest per (doc, variant) for the canonical variant URLs).
 * Revalidated on the C6.5 interval; unprovisioned → empty.
 */
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getPortalDb();
  if (!db) return [];
  const base = portalBaseUrl();
  const [base_entries, variant_entries] = await Promise.all([
    listSitemapEntries(db),
    listVariantSitemapEntries(db),
  ]);
  const baseUrls: MetadataRoute.Sitemap = base_entries.map((entry) => ({
    url: `${base}${documentPath(entry.workspaceSlug, entry.productId, entry.documentSlug)}`,
    lastModified: new Date(entry.publishedAt),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));
  const variantUrls: MetadataRoute.Sitemap = variant_entries.map((entry) => ({
    url: `${base}${variantPath(entry.workspaceSlug, entry.productId, entry.documentSlug, entry.variantSlug ?? '')}`,
    lastModified: new Date(entry.publishedAt),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));
  return [...baseUrls, ...variantUrls];
}
