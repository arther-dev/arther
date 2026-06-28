import type { Metadata } from 'next';
import { BlockRenderer } from '@arther/block-renderer';
import { loadDocument } from '../PortalDocumentView';

/**
 * C5.1 — the print source for the PDF pipeline (ADR-008: "render PDF by printing
 * the portal's own SSR HTML through headless Chrome with @media print CSS"). A
 * clean, chrome-free server render of the published snapshot through the one
 * `@arther/block-renderer` in `print` mode (the C5.2 degradation profile), styled
 * by the `@media print` rules in globals.css. The Trigger.dev render-pdf task
 * navigates Chromium here and prints to PDF; it shares the same cached snapshot
 * read as the document page. Humans don't browse it, so it is noindex.
 */

export const revalidate = 600;

export async function generateStaticParams() {
  return [] as Array<{ workspace: string; product: string; document: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Print', robots: { index: false, follow: false } };
}

export default async function DocumentPrintPage({
  params,
}: {
  params: Promise<{ workspace: string; product: string; document: string }>;
}) {
  const { workspace, product, document } = await params;
  const result = await loadDocument(workspace, product, document, undefined);

  if (result.state !== 'ok') {
    return (
      <main id="main-content" className="portal-shell portal-print">
        <p className="portal-empty">
          {result.state === 'notfound'
            ? 'This document isn’t published, or the link is wrong.'
            : 'Published documentation appears here once the workspace is provisioned.'}
        </p>
      </main>
    );
  }

  const { doc } = result;
  return (
    <main id="main-content" className="portal-shell portal-print">
      <header className="portal-header">
        <p className="portal-header__eyebrow">{doc.productName}</p>
        <h1 className="portal-title">{doc.title}</h1>
        <p className="portal-meta">
          {doc.variant ? `${doc.variant.name} · ` : ''}Version {doc.version}
        </p>
      </header>
      <article className="br-document">
        {doc.blockTree.length > 0 ? (
          <BlockRenderer blocks={doc.blockTree} resolved={doc.resolutionManifest} mode="print" />
        ) : (
          <p className="portal-empty">This document has no content.</p>
        )}
      </article>
    </main>
  );
}
