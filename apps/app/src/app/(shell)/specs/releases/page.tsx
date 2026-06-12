import Link from 'next/link';
import { getActiveWorkspace, listReleases } from '@arther/db';
import { AppShell, EmptyState, Skeleton } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { DeleteReleaseButton } from '../ReleaseForms';
import { SpecsRail } from '../shared';

/**
 * Releases rail view (F5.7): every named snapshot in the workspace, newest
 * first. Creation lives on the product page — a release is an explicit
 * decision about one product's current state (§3.8), not a bulk operation.
 */
export default async function ReleasesPage() {
  const supabase = await getSupabaseServer();

  // Unprovisioned: the first-run frame (E2E baseline).
  if (!supabase) {
    return (
      <AppShell
        rail={<SpecsRail active="releases" />}
        navigator={
          <div aria-busy="true">
            <Skeleton style={{ height: 16, width: '70%', marginBottom: 8 }} />
            <Skeleton style={{ height: 16, width: '55%' }} />
          </div>
        }
      >
        <EmptyState
          title="No releases yet"
          description="A release is a named snapshot of a product’s spec — create one from a product page when the values are ready to pin."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) {
    return (
      <AppShell rail={<SpecsRail active="releases" />}>
        <EmptyState
          title="Create your workspace first"
          description="Releases live inside a workspace — set yours up and come back."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/welcome">
              Create workspace
            </Link>
          }
        />
      </AppShell>
    );
  }

  const releases = await listReleases(supabase, workspace.id);

  return (
    <AppShell rail={<SpecsRail active="releases" />}>
      <div className="specs-content">
        <h1 className="specs-title">Releases</h1>
        {releases.length === 0 ? (
          <EmptyState
            title="No releases yet"
            description="A release is a named snapshot of a product’s spec — create one from a product page when the values are ready to pin."
          />
        ) : (
          <ul className="specs-form" aria-label="All releases">
            {releases.map((r) => (
              <li key={r.id} className="specs-release">
                <Link href={`/specs?product=${r.product_id}`} className="specs-value-button">
                  {r.product_name}
                </Link>
                <strong>{r.name}</strong>
                <span className="specs-release__tag">{r.tag}</span>
                <span className="specs-grid__meta">
                  {r.pinned_count} pinned {r.pinned_count === 1 ? 'value' : 'values'} ·{' '}
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
                {r.notes ? <span className="specs-grid__meta">{r.notes}</span> : null}
                <DeleteReleaseButton releaseId={r.id} name={r.name} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
