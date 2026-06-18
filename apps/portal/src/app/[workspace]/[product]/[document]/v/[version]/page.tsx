import type { Metadata } from 'next';
import { PortalDocumentView, loadDocument } from '../../PortalDocumentView';

/** C9.3 — a versioned URL is canonical to itself; index only a real publication. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspace: string; product: string; document: string; version: string }>;
}): Promise<Metadata> {
  const { workspace, product, document, version } = await params;
  const canonical = `/${workspace}/${product}/${document}/v/${version}`;
  const result = await loadDocument(workspace, product, document, version);
  if (result.state !== 'ok') {
    return {
      title: 'Document',
      alternates: { canonical },
      robots: result.state === 'notfound' ? { index: false, follow: false } : undefined,
    };
  }
  const { doc } = result;
  return {
    title: `${doc.title} (v${doc.version})`,
    description: `${doc.productName} — ${doc.title} (version ${doc.version}).`,
    alternates: { canonical },
  };
}

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
