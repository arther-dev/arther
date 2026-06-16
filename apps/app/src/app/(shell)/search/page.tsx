import Link from 'next/link';
import { getActiveWorkspace, searchWorkspace } from '@arther/db';
import { AppShell } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';

/**
 * G4.7 — workspace search: one box over three scopes (documents · spec values ·
 * library); the fourth scope, in-document find/replace, lives in the editor. A
 * server-rendered GET form so a query is shareable/bookmarkable and works
 * without JavaScript; results are RLS-scoped to the caller's workspace.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const supabase = await getSupabaseServer();
  const workspace = supabase ? await getActiveWorkspace(supabase) : null;
  const results =
    supabase && workspace && query ? await searchWorkspace(supabase, workspace.id, query) : null;
  const total = results
    ? results.documents.length + results.specFields.length + results.components.length
    : 0;

  return (
    <AppShell>
      <div className="specs-content" style={{ maxWidth: 760 }}>
        <h1 className="specs-title">Search</h1>
        <form className="specs-form--row" role="search" action="/search" style={{ gap: 6 }}>
          <input
            className="ui-field__input"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search documents, spec values, and components"
            aria-label="Search the workspace"
            autoFocus
            style={{ flex: 1 }}
          />
          <button type="submit" className="ui-btn ui-btn--primary">
            Search
          </button>
        </form>

        {!supabase ? (
          <p className="specs-grid__meta">
            Search opens once the workspace is provisioned (PROVISIONING.md).
          </p>
        ) : !query ? (
          <p className="specs-grid__meta">
            Find a document by its prose, a spec field by name, or a component in the library.
          </p>
        ) : (
          <>
            <p className="specs-grid__meta" role="status">
              {total} result{total === 1 ? '' : 's'} for “{query}”.
            </p>

            <SearchGroup title="Documents" count={results!.documents.length}>
              {results!.documents.map((d) => (
                <li key={d.documentId} className="specs-section">
                  <Link className="specs-value-button" href={`/documents/${d.documentId}`}>
                    {d.title}
                  </Link>
                  {d.snippet ? <p className="specs-grid__meta">{d.snippet}</p> : null}
                </li>
              ))}
            </SearchGroup>

            <SearchGroup title="Spec values" count={results!.specFields.length}>
              {results!.specFields.map((f) => (
                <li key={f.fieldId} className="specs-form--row">
                  <Link
                    className="specs-value-button"
                    href={
                      f.productId
                        ? `/specs?product=${f.productId}&field=${f.fieldId}`
                        : '/specs/library'
                    }
                  >
                    {f.name}
                  </Link>
                  <span className="specs-grid__meta">
                    {f.category}
                    {f.componentId ? ' · component' : ''}
                  </span>
                </li>
              ))}
            </SearchGroup>

            <SearchGroup title="Library" count={results!.components.length}>
              {results!.components.map((c) => (
                <li key={c.componentId} className="specs-form--row">
                  <Link className="specs-value-button" href="/specs/library">
                    {c.name}
                  </Link>
                  <span className="specs-grid__meta">{c.type}</span>
                </li>
              ))}
            </SearchGroup>

            {total === 0 ? (
              <p className="specs-grid__meta">
                Nothing matched. Try fewer or different words — document search matches prose, not
                spec tokens.
              </p>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function SearchGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="specs-section">
      <h2 className="specs-section__title">
        {title} <span className="specs-grid__meta">({count})</span>
      </h2>
      <ul className="specs-form" aria-label={title}>
        {children}
      </ul>
    </section>
  );
}
