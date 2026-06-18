import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { BlockRenderer } from '@arther/block-renderer';
import { getPortalDocument, getPortalWorkspace, type PortalDocument } from '@arther/db';
import { portalTag } from '../../../../lib/portal-cache';
import { getPortalDb } from '../../../../lib/portal-db';
import { ViewBeacon } from './ViewBeacon';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Loaded =
  | { state: 'unprovisioned' }
  | { state: 'notfound' }
  | { state: 'ok'; doc: PortalDocument; workspaceName: string };

/**
 * C6.5 — the snapshot read is wrapped in Next's data cache (tagged per workspace)
 * so the rendered document page is CDN-cacheable (ISR), independent of Supabase's
 * uncached fetch. Publishing busts `portalTag(workspace)` (the revalidate
 * endpoint), and the per-route `revalidate` is the slow time fallback.
 */
export function loadDocument(
  workspaceSlug: string,
  productId: string,
  documentSlug: string,
  version: string | undefined,
): Promise<Loaded> {
  return unstable_cache(
    async (): Promise<Loaded> => {
      const db = getPortalDb();
      if (!db) return { state: 'unprovisioned' };
      const workspace = await getPortalWorkspace(db, workspaceSlug);
      if (!workspace || !UUID_RE.test(productId)) return { state: 'notfound' };
      const doc = await getPortalDocument(db, {
        workspaceId: workspace.id,
        productId,
        documentSlug,
        version,
      });
      return doc ? { state: 'ok', doc, workspaceName: workspace.name } : { state: 'notfound' };
    },
    ['portal-document', workspaceSlug, productId, documentSlug, version ?? 'latest'],
    { revalidate: 600, tags: [portalTag(workspaceSlug)] },
  )();
}

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
  const result = await loadDocument(workspaceSlug, productId, documentSlug, version);
  if (result.state === 'unprovisioned') {
    return (
      <Message
        title="Portal"
        body="Published documentation appears here once the workspace is provisioned."
      />
    );
  }
  if (result.state === 'notfound') {
    return <Message title="Not found" body="This document isn’t published, or the link is wrong." />;
  }

  const { doc, workspaceName } = result;
  return (
    <main className="portal-shell">
      <ViewBeacon
        workspace={workspaceSlug}
        product={productId}
        document={documentSlug}
        version={version}
      />
      <header className="portal-header">
        <p className="portal-header__eyebrow">{doc.productName}</p>
        <h1 className="portal-title">{doc.title}</h1>
        <p className="portal-meta">
          Version {doc.version} · <Link href={`/${workspaceSlug}`}>{workspaceName}</Link>
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
