/**
 * C6.5 — the Next data-cache tag for a workspace's portal content. The snapshot
 * reads are tagged with this so a publish can bust exactly the affected
 * workspace's cache (the `/api/revalidate` endpoint calls `revalidateTag`), while
 * everything else stays CDN-cached. Slug only (no PII), so it's a safe tag.
 */
export function portalTag(workspaceSlug: string): string {
  return `portal:${workspaceSlug}`;
}
