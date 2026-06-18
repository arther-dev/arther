import type { MetadataRoute } from 'next';
import { portalBaseUrl } from '../lib/portal-url';

/**
 * C9.3 — crawl the public documentation; keep bots out of the API and the gated /
 * dynamic surfaces (those are additionally `noindex`). Points at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const base = portalBaseUrl();
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
