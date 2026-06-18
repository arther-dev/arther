import type { MetadataRoute } from 'next';
import { listSitemapEntries } from '@arther/db';
import { getPortalDb } from '../lib/portal-db';
import { portalBaseUrl } from '../lib/portal-url';

/**
 * C9.3 — `sitemap.xml` over every public, non-archived document (latest
 * publication per doc). Revalidated on the C6.5 interval; unprovisioned → empty.
 */
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getPortalDb();
  if (!db) return [];
  const base = portalBaseUrl();
  const entries = await listSitemapEntries(db);
  return entries.map((entry) => ({
    url: `${base}/${entry.workspaceSlug}/${entry.productId}/${entry.documentSlug}`,
    lastModified: new Date(entry.publishedAt),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));
}
