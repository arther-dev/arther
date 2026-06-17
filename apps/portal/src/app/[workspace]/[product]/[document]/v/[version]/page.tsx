import { PortalDocumentView } from '../../PortalDocumentView';

/** C6.3 — a stable, versioned document URL (`…/v/{version}`); previous
 *  publications stay addressable for rollback/reference. */
export default async function VersionedDocumentPage({
  params,
}: {
  params: Promise<{ workspace: string; product: string; document: string; version: string }>;
}) {
  const { workspace, product, document, version } = await params;
  return (
    <PortalDocumentView
      workspaceSlug={workspace}
      productId={product}
      documentSlug={document}
      version={version}
    />
  );
}
