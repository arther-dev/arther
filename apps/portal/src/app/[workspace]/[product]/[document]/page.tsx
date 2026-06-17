import { PortalDocumentView } from './PortalDocumentView';

// C6.5 — CDN-cache the rendered snapshot; refresh on a slow interval and bust it
// on publish (the app calls the revalidate endpoint). `generateStaticParams`
// returning `[]` bakes nothing (documents are open-ended) while opting the route
// into on-demand ISR (rendered once per URL, then served from the full route cache).
export const revalidate = 600;
export async function generateStaticParams() {
  return [] as Array<{ workspace: string; product: string; document: string }>;
}

/** C6.3 — the document page (latest publication). Versioned URLs at `…/v/{version}`. */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ workspace: string; product: string; document: string }>;
}) {
  const { workspace, product, document } = await params;
  return (
    <PortalDocumentView workspaceSlug={workspace} productId={product} documentSlug={document} />
  );
}
