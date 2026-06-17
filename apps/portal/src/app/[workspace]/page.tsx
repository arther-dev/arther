import Link from 'next/link';
import { getPortalWorkspace, listPortalPublishedDocuments } from '@arther/db';
import { getPortalDb } from '../../lib/portal-db';

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
  const db = getPortalDb();
  if (!db) {
    return (
      <main className="portal-shell">
        <h1 className="portal-title">Portal</h1>
        <p className="portal-empty">
          Published documentation appears here once the workspace is provisioned.
        </p>
      </main>
    );
  }

  const workspace = await getPortalWorkspace(db, workspaceSlug);
  if (!workspace) {
    return (
      <main className="portal-shell">
        <h1 className="portal-title">Not found</h1>
        <p className="portal-empty">No portal is published at this address.</p>
      </main>
    );
  }

  const documents = await listPortalPublishedDocuments(db, workspace.id);

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <p className="portal-header__eyebrow">Documentation</p>
        <h1 className="portal-title">{workspace.name}</h1>
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
