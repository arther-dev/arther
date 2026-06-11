import { AppShell, Button, EmptyState } from '@arther/ui';

/**
 * Dashboard — the personal action queue (no rail, no Navigator, no Inspector
 * per the region matrix). Real queue items arrive with Smart Spec Tracking
 * (G6.5); this is the standardized all-caught-up empty state.
 */
export default function DashboardPage() {
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
