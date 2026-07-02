import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getActiveWorkspace,
  listActionItems,
  listBrandProfiles,
  listDocumentTypes,
  listInvitations,
  listMembers,
  listProducts,
} from '@arther/db';
import {
  buildFirstRunChecklist,
  groupActionItems,
  summarizeActionItems,
  type WorkspaceId,
} from '@arther/types';
import { roleAllows } from '@arther/authz';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';
import { AssistantNudge } from '../../../components/AssistantNudge';
import { ActionQueue } from './ActionQueue';
import { FirstRunChecklist } from './FirstRunChecklist';

/**
 * Dashboard — the personal action queue (no rail, no Navigator, no Inspector per
 * the region matrix). It carries the items that need the signed-in user now
 * (G6.5): section reviews after a spec change, approvals, overrides, snippet
 * reviews, mentions, briefs — written by the propagation engine (G6.2), routed to
 * the domain owner (G6.3), grouped by type and ordered by urgency. The K.8 admin
 * first-run setup checklist sits on top while a new workspace is incomplete; the
 * calm "all caught up" empty state shows when the queue is clear.
 *
 * A just-authenticated user with no workspace yet is sent to first-run workspace
 * creation. Unprovisioned/E2E (no Supabase env) renders the all-caught-up frame.
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ resolved?: string }>;
}) {
  const includeResolved = (await searchParams)?.resolved === '1';
  const supabase = await getSupabaseServer();

  const allCaughtUp = (
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
  );

  // Unprovisioned/E2E: render the frame so the surface degrades, never crashes.
  if (!supabase) return <AppShell>{allCaughtUp}</AppShell>;

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect('/welcome');

  let checklist: ReactNode = null;
  if (roleAllows(workspace.role, 'workspace.manage')) {
    checklist = await buildChecklist(supabase, workspace.id);
  }

  const items = await listActionItems(supabase, { includeResolved });

  return (
    <AppShell>
      {checklist}
      {items.length > 0 ? (
        <ActionQueue
          groups={groupActionItems(items)}
          stats={summarizeActionItems(items)}
          includeResolved={includeResolved}
        />
      ) : (
        allCaughtUp
      )}
    </AppShell>
  );
}
