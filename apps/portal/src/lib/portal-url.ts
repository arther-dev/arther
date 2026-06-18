/**
 * C9.3 — the portal's own absolute origin, for canonical URLs, the sitemap, and
 * robots. `PORTAL_BASE_URL` is the deployed origin (e.g. https://portal.arther.io);
 * the local dev default keeps these routes valid without configuration.
 */
export function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}
