import { PortalDocumentView } from '../../PortalDocumentView';

// C6.5 — a versioned snapshot is immutable, so cache it hard and refresh slowly.
// `generateStaticParams` returning `[]` opts the route into on-demand ISR (the
// full route cache) without prebuilding any of the open-ended version URLs.
export const revalidate = 3600;
export async function generateStaticParams() {
  return [] as Array<{ workspace: string; product: string; document: string; version: string }>;
}

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
