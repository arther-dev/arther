import { PortalDocumentView } from './PortalDocumentView';

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
