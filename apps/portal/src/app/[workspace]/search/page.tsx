import Link from 'next/link';
import { getPortalWorkspace, recordPortalEvent, searchPortalDocuments } from '@arther/db';
import { getPortalDb } from '../../../lib/portal-db';
import { readVisitorId } from '../../../lib/portal-visitor';

// C9.3 — search results are query-dependent; keep them out of the index.
export const metadata = { robots: { index: false, follow: false } };

/**
 * C6.4 — portal full-text search over published documentation. A server-rendered
 * GET form (shareable/bookmarkable, works without JavaScript); matches the latest
 * non-archived public snapshot per document via `published_snapshots.search_tsv`.
 */
export default async function PortalSearch({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { workspace: workspaceSlug } = await params;
  const { q = '' } = await searchParams;
  const query = q.trim();

  const db = getPortalDb();
  const workspace = db ? await getPortalWorkspace(db, workspaceSlug) : null;
  const hits = db && workspace && query ? await searchPortalDocuments(db, workspace.id, query) : [];

  // C9.6 — meter the search (best-effort). The page is dynamic (query-dependent),
  // so a server-side record runs once per submitted search, not per cached view.
  if (db && workspace && query) {
    try {
      await recordPortalEvent(
        db,
        { workspaceId: workspace.id },
        { eventType: 'portal_searched', sessionId: await readVisitorId(), payload: { query, results: hits.length } },
      );
    } catch {
      // analytics are best-effort
    }
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <p className="portal-header__eyebrow">
          <Link href={`/${workspaceSlug}`}>{workspace?.name ?? 'Documentation'}</Link>
        </p>
        <h1 className="portal-title">Search</h1>
      </header>

      <form className="portal-search" action={`/${workspaceSlug}/search`} method="get">
        <input
          className="portal-search__input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search published documentation"
          aria-label="Search published documentation"
        />
        <button className="portal-search__button" type="submit">
          Search
        </button>
      </form>

      {!db ? (
        <p className="portal-empty">Search is available once the workspace is provisioned.</p>
      ) : !workspace ? (
        <p className="portal-empty">No portal is published at this address.</p>
      ) : query === '' ? (
        <p className="portal-empty">Enter a term to search the published documentation.</p>
      ) : hits.length === 0 ? (
        <p className="portal-empty">No documents match “{query}”.</p>
      ) : (
        <ul className="portal-doc-list">
          {hits.map((h) => (
            <li key={h.documentId}>
              <Link href={`/${workspaceSlug}/${h.productId}/${h.documentSlug}`}>
                <span>
                  <strong>{h.title}</strong>
                  <br />
                  <span className="portal-meta">
                    {h.productName} · v{h.version}
                  </span>
                  {h.snippet ? (
                    <>
                      <br />
                      <span className="portal-meta">{h.snippet}</span>
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
