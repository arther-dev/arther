import Link from 'next/link';
import {
  getActiveWorkspace,
  listArchivedBrandProfiles,
  listBrandProfiles,
} from '@arther/db';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import {
  ArchiveBrandProfileButton,
  CreateBrandProfileForm,
  RestoreBrandProfileButton,
  SetDefaultButton,
} from './BrandProfileForms';

/**
 * G0.4 Brand Profiles — the workspace identity configs the generator consumes
 * (logo, palette, typography, voice, glossary, unit preference). Owner/admin
 * only (canDo 'workspace.manage' + 0004 RLS defence-in-depth). The first profile
 * becomes the workspace default automatically; a workspace can never have zero
 * (spec §7.3), so the last live profile can't be archived.
 */
export default async function BrandProfilesPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Brand profiles"
          description="Define logo, palette, typography, voice, and glossary here once the environment is provisioned."
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
          description="Brand profiles live inside a workspace — set yours up and come back."
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
          title="Brand profiles"
          description="Only workspace owners and admins can manage brand profiles."
        />
      </AppShell>
    );
  }

  const [profiles, archived] = await Promise.all([
    listBrandProfiles(supabase, workspace.id),
    listArchivedBrandProfiles(supabase, workspace.id),
  ]);

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings">← Settings</Link>
        </p>
        <h1 className="specs-title">Brand profiles</h1>
        <p className="specs-grid__meta">
          The visual and tonal identity applied when generating and publishing documents. A document
          type with no profile of its own uses the workspace default.
        </p>

        <section className="specs-section">
          <h2 className="specs-section__title">Profiles</h2>
          {profiles.length === 0 ? (
            <p className="specs-grid__meta">
              No brand profiles yet — the first one you create becomes the workspace default.
            </p>
          ) : (
            <ul className="specs-form" aria-label="Brand profiles">
              {profiles.map((p) => (
                <li key={p.id} className="specs-release">
                  <Link href={`/settings/brand-profiles/${p.id}`}>{p.name}</Link>
                  {p.is_workspace_default ? (
                    <span className="specs-release__tag">workspace default</span>
                  ) : null}
                  <span className="specs-grid__meta">
                    {p.referenced_by > 0
                      ? `${p.referenced_by} document type${p.referenced_by === 1 ? '' : 's'}`
                      : 'unreferenced'}
                  </span>
                  {!p.is_workspace_default ? <SetDefaultButton id={p.id} /> : null}
                  <ArchiveBrandProfileButton id={p.id} name={p.name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="specs-section">
          <h2 className="specs-section__title">New brand profile</h2>
          <CreateBrandProfileForm />
        </section>

        {archived.length > 0 ? (
          <section className="specs-section">
            <details>
              <summary className="specs-section__title">Archived ({archived.length})</summary>
              <ul className="specs-form" aria-label="Archived brand profiles">
                {archived.map((p) => (
                  <li key={p.id} className="specs-release">
                    {p.name}
                    <RestoreBrandProfileButton id={p.id} name={p.name} />
                  </li>
                ))}
              </ul>
            </details>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
