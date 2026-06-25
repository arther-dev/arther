import type { Metadata } from 'next';
import {
  PortalVariantDocumentView,
  loadVariantDocument,
} from '../../PortalDocumentView';
import { variantPath } from '../../../../../../lib/portal-url';

/** V.9 — per-variant SEO: canonical points at this variant's own URL. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspace: string; product: string; document: string; variant: string }>;
}): Promise<Metadata> {
  const { workspace, product, document, variant } = await params;
  const canonical = variantPath(workspace, product, document, variant);
  const result = await loadVariantDocument(workspace, product, document, variant, undefined);
  if (result.state !== 'ok') {
    return {
      title: 'Document',
      alternates: { canonical },
      robots: result.state === 'notfound' ? { index: false, follow: false } : undefined,
    };
  }
  const { doc } = result;
  const variantName = doc.variant?.name ?? variant;
  const description = `${doc.productName} — ${doc.title} (${variantName}, version ${doc.version}).`;
  return {
    title: `${doc.title} · ${variantName}`,
    description,
    alternates: { canonical },
    openGraph: { title: `${doc.title} · ${variantName}`, description, type: 'article', url: canonical },
  };
}

// C6.5 — same on-demand ISR + tag-bust model as the base document page.
export const revalidate = 600;
export async function generateStaticParams() {
  return [] as Array<{ workspace: string; product: string; document: string; variant: string }>;
}

/** V.9 — the canonical page for one variant of a document. */
export default async function VariantDocumentPage({
  params,
}: {
  params: Promise<{ workspace: string; product: string; document: string; variant: string }>;
}) {
  const { workspace, product, document, variant } = await params;
  return (
    <PortalVariantDocumentView
      workspaceSlug={workspace}
      productId={product}
      documentSlug={document}
      variantSlug={variant}
    />
  );
}
