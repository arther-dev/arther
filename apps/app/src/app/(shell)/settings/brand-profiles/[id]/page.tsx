import Link from 'next/link';
import { roleAllows } from '@arther/authz';
import { getActiveWorkspace, getBrandProfile } from '@arther/db';
import { brandProfileIdSchema } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { EditBrandProfileForm } from '../BrandProfileForms';

/**
 * G0.4 — the Brand Profile editor. Owner/admin only (RLS + the action's canDo
 * check). The id param is validated at the boundary (F8.5) so a malformed path
 * degrades to "not found" rather than a 500.
 */
export default async function BrandProfileEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsedId = brandProfileIdSchema.safeParse(id);

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Brand profile"
          description="Brand profile editing is available once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  const canManage = workspace ? roleAllows(workspace.role, 'workspace.manage') : false;
  const profile = parsedId.success && canManage ? await getBrandProfile(supabase, parsedId.data) : null;

  if (!profile) {
    return (
      <AppShell>
        <EmptyState
          title="Brand profile not found"
          description="It may have been archived, or you may not have access."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/settings/brand-profiles">
              Back to brand profiles
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings/brand-profiles">← Brand profiles</Link>
        </p>
        <h1 className="specs-title">
          {profile.name}
          {profile.is_workspace_default ? (
            <span className="specs-release__tag"> workspace default</span>
          ) : null}
        </h1>
        <section className="specs-section">
          <EditBrandProfileForm profile={profile} />
        </section>
      </div>
    </AppShell>
  );
}
