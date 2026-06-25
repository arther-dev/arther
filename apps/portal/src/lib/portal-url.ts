/**
 * C9.3 — the portal's own absolute origin, for canonical URLs, the sitemap, and
 * robots. `PORTAL_BASE_URL` is the deployed origin (e.g. https://portal.arther.io);
 * the local dev default keeps these routes valid without configuration.
 */
export function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

/**
 * V.9 — the canonical (relative) path for a document's base publication. The
 * absolute form is resolved by the root layout's `metadataBase`. Variants hang
 * off this path under `/var/{variantSlug}` so each is a real, shareable,
 * indexable URL (the spec rejects a `?variant=` query for exactly this reason).
 */
export function documentPath(
  workspaceSlug: string,
  productId: string,
  documentSlug: string,
): string {
  return `/${workspaceSlug}/${productId}/${documentSlug}`;
}

/** V.9 — the canonical (relative) path for one variant of a document. */
export function variantPath(
  workspaceSlug: string,
  productId: string,
  documentSlug: string,
  variantSlug: string,
): string {
  return `${documentPath(workspaceSlug, productId, documentSlug)}/var/${variantSlug}`;
}
