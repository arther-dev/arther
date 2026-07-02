import Link from 'next/link';
import {
  getActiveWorkspace,
  getTopSearches,
  getWorkspaceDocumentConsumption,
  getWorkspaceHealth,
  getWorkspaceReviewCycleTimes,
  getZeroResultSearches,
} from '@arther/db';
import { roleAllows } from '@arther/authz';
import { formatReviewDuration } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';

const pct = (rate: number | null): string => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

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

  const canManage = roleAllows(workspace.role, 'workspace.manage');
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

  const [documents, topSearches, zeroResults, health, reviewTimes] = await Promise.all([
    getWorkspaceDocumentConsumption(supabase, workspace.id),
    getTopSearches(supabase, workspace.id),
    getZeroResultSearches(supabase, workspace.id),
    getWorkspaceHealth(supabase, workspace.id),
    getWorkspaceReviewCycleTimes(supabase, workspace.id),
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
          <h2 className="specs-section__title">Workspace health</h2>
          <dl className="specs-form" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <dt className="specs-grid__meta">Generation success</dt>
              <dd style={{ margin: 0, fontSize: 22, fontWeight: 650 }}>
                {pct(health.generationSuccessRate)}
              </dd>
              <span className="specs-grid__meta">
                {health.generationsSucceeded.toLocaleString()} of{' '}
                {health.generationsTotal.toLocaleString()} runs
              </span>
            </div>
            <div>
              <dt className="specs-grid__meta">Rejection rate</dt>
              <dd style={{ margin: 0, fontSize: 22, fontWeight: 650 }}>{pct(health.rejectionRate)}</dd>
              <span className="specs-grid__meta">
                {health.approvalsRejected.toLocaleString()} of{' '}
                {health.approvalsTotal.toLocaleString()} decisions
              </span>
            </div>
            <div>
              <dt className="specs-grid__meta">Documents with stale spec data</dt>
              <dd style={{ margin: 0, fontSize: 22, fontWeight: 650 }}>
                {health.staleDocuments.toLocaleString()}
              </dd>
              <span className="specs-grid__meta">references behind the current field version</span>
            </div>
            <div>
              <dt className="specs-grid__meta">Avg. time in review</dt>
              <dd style={{ margin: 0, fontSize: 22, fontWeight: 650 }}>
                {formatReviewDuration(reviewTimes.avgHoursToDecision)}
              </dd>
              <span className="specs-grid__meta">
                {reviewTimes.reviewsMeasured > 0
                  ? `median ${formatReviewDuration(reviewTimes.medianHoursToDecision)} · ${reviewTimes.reviewsMeasured.toLocaleString()} decision${
                      reviewTimes.reviewsMeasured === 1 ? '' : 's'
                    }`
                  : 'no completed reviews yet'}
              </span>
            </div>
          </dl>
          <p className="specs-grid__meta">
            Operational health across generation, review, and spec tracking. Review time is measured
            from a document entering review to its approval or rejection.
          </p>
        </section>

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
