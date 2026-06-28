import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getActiveWorkspace,
  listBrandProfiles,
  listDocumentTypes,
  listInvitations,
  listMembers,
  listProducts,
} from '@arther/db';
import { buildFirstRunChecklist, type WorkspaceId } from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';
import { AssistantNudge } from '../../../components/AssistantNudge';
import { FirstRunChecklist } from './FirstRunChecklist';

/**
 * Dashboard — the personal action queue (no rail, no Navigator, no Inspector
 * per the region matrix). Real queue items arrive with Smart Spec Tracking
 * (G6.5); this is the standardized all-caught-up empty state, with the K.8
 * admin first-run setup checklist on top while a new workspace is incomplete.
 *
 * A just-authenticated user with no workspace yet (e.g. first Google sign-in)
 * is sent to first-run workspace creation — every other surface assumes a
 * workspace exists. Unprovisioned/E2E (no Supabase env) renders the frame.
 */
async function buildChecklist(
  supabase: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<ReactNode> {
  const [products, brands, docTypes, members, invitations] = await Promise.all([
    listProducts(supabase, workspaceId),
    listBrandProfiles(supabase, workspaceId),
    listDocumentTypes(supabase, workspaceId),
    listMembers(supabase, workspaceId),
    listInvitations(supabase, workspaceId),
  ]);
  const { items, remaining, complete } = buildFirstRunChecklist({
    product: products.length > 0,
    brand_profile: brands.length > 0,
    // A workspace-owned (created or forked) document type — the built-in globals
    // don't count as "configured your own".
    document_type: docTypes.some((d) => d.workspace_id === workspaceId && !d.archived_at),
    // A teammate is invited once a second member exists or an invitation is out.
    teammate: members.length > 1 || invitations.length > 0,
  });
  // K.8 — non-gating: collapse (render nothing) once setup is complete.
  if (complete) return null;
  return <FirstRunChecklist items={items} remaining={remaining} />;
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  let checklist: ReactNode = null;
  if (supabase) {
    const workspace = await getActiveWorkspace(supabase);
    if (!workspace) redirect('/welcome');
    if (workspace.role === 'owner' || workspace.role === 'admin') {
      checklist = await buildChecklist(supabase, workspace.id);
    }
  }

  return (
    <AppShell>
      {checklist}
      <EmptyState
        title="You're all caught up"
        description="Section reviews, approvals, and mentions that need your action will appear here."
        primaryAction={
          <Link className="ui-btn ui-btn--primary" href="/specs/generate">
            Generate a document
          </Link>
        }
        secondaryAction={
          <Link className="ui-btn ui-btn--ghost" href="/specs">
            Add a product
          </Link>
        }
        nudge={<AssistantNudge id="dashboard-first-run" prompt="how to get started in Arther." />}
      />
    </AppShell>
  );
}
