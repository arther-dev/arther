import Link from 'next/link';
import { roleAllows } from '@arther/authz';
import { getActiveWorkspace, getQualityStandard } from '@arther/db';
import { qualityStandardIdSchema } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
import { EditQualityStandardForm } from '../QualityStandardForms';

/**
 * G0.5 — the Quality Standard editor. Owner/admin only (RLS + the action's canDo
 * check). The id param is validated at the boundary (F8.5) so a malformed path
 * degrades to "not found" rather than a 500.
 */
export default async function QualityStandardEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsedId = qualityStandardIdSchema.safeParse(id);

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Quality standard"
          description="Quality standard editing is available once the environment is provisioned."
        />
      </AppShell>
    );
  }

  const workspace = await getActiveWorkspace(supabase);
  const canManage = workspace ? roleAllows(workspace.role, 'workspace.manage') : false;
  const standard =
    parsedId.success && canManage ? await getQualityStandard(supabase, parsedId.data) : null;

  if (!standard) {
    return (
      <AppShell>
        <EmptyState
          title="Quality standard not found"
          description="It may have been deleted, or you may not have access."
          primaryAction={
            <Link className="ui-btn ui-btn--primary" href="/settings/quality-standards">
              Back to quality standards
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
          <Link href="/settings/quality-standards">← Quality standards</Link>
        </p>
        <h1 className="specs-title">{standard.name}</h1>
        <section className="specs-section">
          <EditQualityStandardForm standard={standard} />
        </section>
      </div>
    </AppShell>
  );
}
