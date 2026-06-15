import Link from 'next/link';
import { getActiveWorkspace, listQualityStandards } from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  CreateQualityStandardForm,
  DeleteQualityStandardButton,
} from './QualityStandardForms';

/**
 * G0.5 Document Quality Standards — the editorial-discipline configs the
 * generator is held to (section length limits, required structural elements,
 * voice/mood rules, conditions metadata). Separate from Brand Profiles by design
 * (generator spec §3.5). Owner/admin only (canDo 'workspace.manage' + 0004 RLS
 * defence-in-depth). A standard referenced by a Document Type can't be deleted —
 * the FK blocks it and the surface explains why.
 */
export default async function QualityStandardsPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Quality standards"
          description="Define the editorial discipline applied at generation here once the environment is provisioned."
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
          description="Quality standards live inside a workspace — set yours up and come back."
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
          title="Quality standards"
          description="Only workspace owners and admins can manage quality standards."
        />
      </AppShell>
    );
  }

  const standards = await listQualityStandards(supabase, workspace.id);

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings">← Settings</Link>
        </p>
        <h1 className="specs-title">Quality standards</h1>
        <p className="specs-grid__meta">
          Editorial discipline the generator enforces — section length limits, required structural
          elements, and voice rules. A document type names the standard it&apos;s held to; one
          standard can apply across many types.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Standards</h2>
          {standards.length === 0 ? (
            <p className="specs-grid__meta">No quality standards yet — create your first below.</p>
          ) : (
            <ul className="specs-form" aria-label="Quality standards">
              {standards.map((s) => (
                <li key={s.id} className="specs-release">
                  <Link href={`/settings/quality-standards/${s.id}`}>{s.name}</Link>
                  <span className="specs-release__tag">
                    {s.constraints.length} constraint{s.constraints.length === 1 ? '' : 's'}
                  </span>
                  <span className="specs-grid__meta">
                    {s.referenced_by > 0
                      ? `${s.referenced_by} document type${s.referenced_by === 1 ? '' : 's'}`
                      : 'unreferenced'}
                  </span>
                  {s.referenced_by === 0 ? (
                    <DeleteQualityStandardButton id={s.id} name={s.name} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">New quality standard</h2>
          <CreateQualityStandardForm />
        </section>
      </div>
    </AppShell>
  );
}
