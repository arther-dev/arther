import type { Metadata } from 'next';
import { PortalDocumentView, loadDocument } from './PortalDocumentView';

/** C9.3 — per-document SEO: title, description, canonical, Open Graph. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspace: string; product: string; document: string }>;
}): Promise<Metadata> {
  const { workspace, product, document } = await params;
  const canonical = `/${workspace}/${product}/${document}`;
  const result = await loadDocument(workspace, product, document, undefined);
  if (result.state !== 'ok') {
    // A missing doc shouldn't be indexed; an unprovisioned env stays neutral.
    return {
      title: 'Document',
      alternates: { canonical },
      robots: result.state === 'notfound' ? { index: false, follow: false } : undefined,
    };
  }
  const { doc } = result;
  const description = `${doc.productName} — ${doc.title} (version ${doc.version}).`;
  return {
    title: doc.title,
    description,
    alternates: { canonical },
    openGraph: { title: doc.title, description, type: 'article', url: canonical },
  };
}

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
