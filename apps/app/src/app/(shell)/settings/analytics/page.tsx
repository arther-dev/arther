import Link from 'next/link';
import {
  getActiveWorkspace,
  getTopSearches,
  getWorkspaceDocumentConsumption,
  getZeroResultSearches,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';

/**
 * A.6 — admin consumption analytics: a workspace-wide view of how the published
 * portal is consumed. Cross-document comparison (views / unique visitors /
 * downloads), the most-run searches, and the **zero-result searches** — the
 * content-gap signal showing what readers look for and can't find. Owner/admin
 * only (the 0025 RPCs are member-RLS safe; this surface adds the product gate).
 */
export default async function WorkspaceAnalyticsPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Analytics"
          description="Portal consumption analytics appear here once the workspace is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
    return (
      <AppShell>
        <EmptyState
          title="Create your workspace first"
          description="Analytics live inside a workspace."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  if (!canManage) {
    return (
      <AppShell>
        <EmptyState
          title="Analytics"
          description="Only workspace owners and admins can see consumption analytics."
        />
      </AppShell>
    );
  }

  const [documents, topSearches, zeroResults] = await Promise.all([
    getWorkspaceDocumentConsumption(supabase, workspace.id),
    getTopSearches(supabase, workspace.id),
    getZeroResultSearches(supabase, workspace.id),
  ]);

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings">← Settings</Link>
        </p>
        <h1 className="specs-title">Analytics</h1>
        <p className="specs-grid__meta">
          How your published portal is consumed. Counts aggregate the portal's view, download, and
          search events.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Documents by consumption</h2>
          {documents.length === 0 ? (
            <p className="specs-grid__meta">No portal activity yet.</p>
          ) : (
            <ul className="specs-form" aria-label="Documents by consumption">
              {documents.map((d) => (
                <li key={d.documentId} className="specs-release">
                  <Link href={`/documents/${d.documentId}`}>{d.title}</Link>
                  <span className="specs-grid__meta">
                    {d.views.toLocaleString()} view{d.views === 1 ? '' : 's'} ·{' '}
                    {d.uniqueVisitors.toLocaleString()} visitor{d.uniqueVisitors === 1 ? '' : 's'} ·{' '}
                    {d.downloads.toLocaleString()} download{d.downloads === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Top searches</h2>
          {topSearches.length === 0 ? (
            <p className="specs-grid__meta">No searches yet.</p>
          ) : (
            <ul className="specs-form" aria-label="Top searches">
              {topSearches.map((s) => (
                <li key={s.query} className="specs-release">
                  <span>“{s.query}”</span>
                  <span className="specs-grid__meta">
                    {s.searches.toLocaleString()} search{s.searches === 1 ? '' : 'es'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">Zero-result searches</h2>
          <p className="specs-grid__meta">
            What readers searched for and found nothing — candidate gaps in your documentation.
          </p>
          {zeroResults.length === 0 ? (
            <p className="specs-grid__meta">Every search returned at least one result.</p>
          ) : (
            <ul className="specs-form" aria-label="Zero-result searches">
              {zeroResults.map((s) => (
                <li key={s.query} className="specs-release">
                  <span>“{s.query}”</span>
                  <span className="specs-release__tag">no results</span>
                  <span className="specs-grid__meta">
                    {s.searches.toLocaleString()} time{s.searches === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
