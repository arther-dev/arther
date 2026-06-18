import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import {
  getPortalWorkspace,
  listPortalPublishedDocuments,
  type PortalDocumentListing,
} from '@arther/db';
import { portalTag } from '../../lib/portal-cache';
import { getPortalDb } from '../../lib/portal-db';

// C6.5 — the library is CDN-cached (ISR) and busted on publish (revalidate tag).
// `generateStaticParams` returning `[]` prebuilds nothing (tenants are open-ended)
// but opts the route into the on-demand ISR / full-route cache instead of dynamic
// rendering: each workspace is rendered once, cached, then served from the edge.
export const revalidate = 600;
export async function generateStaticParams() {
  return [] as Array<{ workspace: string }>;
}

type Loaded =
  | { state: 'unprovisioned' }
  | { state: 'notfound' }
  | { state: 'ok'; name: string; documents: PortalDocumentListing[] };

function loadLibrary(workspaceSlug: string): Promise<Loaded> {
  return unstable_cache(
    async (): Promise<Loaded> => {
      const db = getPortalDb();
      if (!db) return { state: 'unprovisioned' };
      const workspace = await getPortalWorkspace(db, workspaceSlug);
      if (!workspace) return { state: 'notfound' };
      const documents = await listPortalPublishedDocuments(db, workspace.id);
      return { state: 'ok', name: workspace.name, documents };
    },
    ['portal-library', workspaceSlug],
    { revalidate: 600, tags: [portalTag(workspaceSlug)] },
  )();
}

/**
 * C6.3 — the workspace portal home: the published documentation library (latest
 * publication per document, newest first). Product grid + per-product landing
 * pages are follow-ups; this is the entry point into the document pages.
 */
export default async function WorkspaceHome({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceSlug } = await params;
  const result = await loadLibrary(workspaceSlug);

  if (result.state === 'unprovisioned') {
    return (
      <main id="main-content" tabIndex={-1} className="portal-shell">
        <h1 className="portal-title">Portal</h1>
        <p className="portal-empty">
          Published documentation appears here once the workspace is provisioned.
        </p>
      </main>
    );
  }
  if (result.state === 'notfound') {
    return (
      <main id="main-content" tabIndex={-1} className="portal-shell">
        <h1 className="portal-title">Not found</h1>
        <p className="portal-empty">No portal is published at this address.</p>
      </main>
    );
  }

  const { name, documents } = result;
  return (
    <main id="main-content" tabIndex={-1} className="portal-shell">
      <header className="portal-header">
        <p className="portal-header__eyebrow">Documentation</p>
        <h1 className="portal-title">{name}</h1>
      </header>
      <form className="portal-search" action={`/${workspaceSlug}/search`} method="get">
        <input
          className="portal-search__input"
          type="search"
          name="q"
          placeholder="Search published documentation"
          aria-label="Search published documentation"
        />
        <button className="portal-search__button" type="submit">
          Search
        </button>
      </form>
      {documents.length === 0 ? (
        <p className="portal-empty">No documents have been published yet.</p>
      ) : (
        <ul className="portal-doc-list">
          {documents.map((d) => (
            <li key={d.documentId}>
              <Link href={`/${workspaceSlug}/${d.productId}/${d.documentSlug}`}>
                <span>
                  <strong>{d.title}</strong>
                  <br />
                  <span className="portal-meta">{d.productName}</span>
                </span>
                <span className="portal-meta">v{d.version}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
