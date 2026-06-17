import Link from 'next/link';
import { BlockRenderer } from '@arther/block-renderer';
import { getPortalDocument, getPortalWorkspace } from '@arther/db';
import { getPortalDb } from '../../../../lib/portal-db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="portal-shell">
      <h1 className="portal-title">{title}</h1>
      <p className="portal-empty">{body}</p>
    </main>
  );
}

/**
 * C6.2 — server-render a frozen published snapshot through the one shared
 * `@arther/block-renderer`. The snapshot is self-contained (inline tokens carry
 * their values; `resolutionManifest` feeds spec_table/chart), so there are no
 * live spec lookups. Interactive blocks (accordion → `<details>`, video →
 * `<video controls>`) are native HTML, so the page is readable and interactive
 * without JavaScript. `version` omitted → the latest non-archived publication.
 */
export async function PortalDocumentView({
  workspaceSlug,
  productId,
  documentSlug,
  version,
}: {
  workspaceSlug: string;
  productId: string;
  documentSlug: string;
  version?: string;
}) {
  const db = getPortalDb();
  if (!db) {
    return (
      <Message
        title="Portal"
        body="Published documentation appears here once the workspace is provisioned."
      />
    );
  }

  const workspace = await getPortalWorkspace(db, workspaceSlug);
  const doc =
    workspace && UUID_RE.test(productId)
      ? await getPortalDocument(db, {
          workspaceId: workspace.id,
          productId,
          documentSlug,
          version,
        })
      : null;

  if (!workspace || !doc) {
    return <Message title="Not found" body="This document isn’t published, or the link is wrong." />;
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <p className="portal-header__eyebrow">{doc.productName}</p>
        <h1 className="portal-title">{doc.title}</h1>
        <p className="portal-meta">
          Version {doc.version} · <Link href={`/${workspaceSlug}`}>{workspace.name}</Link>
        </p>
      </header>
      <article className="br-document">
        {doc.blockTree.length > 0 ? (
          <BlockRenderer blocks={doc.blockTree} resolved={doc.resolutionManifest} />
        ) : (
          <p className="portal-empty">This document has no content.</p>
        )}
      </article>
    </main>
  );
}
