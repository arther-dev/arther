import { redirect } from 'next/navigation';
import { getActiveWorkspace } from '@arther/db';
import { AppShell, Button, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../lib/supabase/server';

/**
 * Dashboard — the personal action queue (no rail, no Navigator, no Inspector
 * per the region matrix). Real queue items arrive with Smart Spec Tracking
 * (G6.5); this is the standardized all-caught-up empty state.
 *
 * A just-authenticated user with no workspace yet (e.g. first Google sign-in)
 * is sent to first-run workspace creation — every other surface assumes a
 * workspace exists. Unprovisioned/E2E (no Supabase env) renders the frame.
 */
export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  if (supabase && !(await getActiveWorkspace(supabase))) {
    redirect('/welcome');
  }
  return (
    <AppShell>
      <EmptyState
        title="You're all caught up"
        description="Section reviews, approvals, and mentions that need your action will appear here."
        primaryAction={<Button>Generate a document</Button>}
        secondaryAction={<Button variant="ghost">Add a product</Button>}
      />
    </AppShell>
  );
}
