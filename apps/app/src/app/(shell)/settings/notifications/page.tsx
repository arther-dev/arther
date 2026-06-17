import Link from 'next/link';
import { getActiveWorkspace, listNotificationPreferences } from '@arther/db';
import {
  NOTIFICATION_EVENT_TYPES,
  resolveNotificationPreference,
  type NotificationChannelPrefs,
  type NotificationEventType,
} from '@arther/types';
import { AppShell, EmptyState } from '@arther/ui';
import { getSupabaseServer } from '../../../../lib/supabase/server';
import { NotificationPreferences } from './NotificationPreferences';

/**
 * C3.2 — personal notification preferences (per event, per channel). Available to
 * every member (it's about your own account, not workspace admin). Preferences are
 * workspace-wide per user at launch (spec §9.4); per-document is post-launch.
 */
export default async function NotificationSettingsPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return (
      <AppShell>
        <EmptyState
          title="Notification preferences"
          description="Choose which events notify you, in-app and by email, once provisioned."
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
          description="Notification preferences live inside a workspace."
        />
      </AppShell>
    );
  }

  const stored = await listNotificationPreferences(supabase, workspace.membershipId);
  const byEvent = new Map(stored.map((p) => [p.eventType, p]));
  const initial = Object.fromEntries(
    NOTIFICATION_EVENT_TYPES.map((event) => [
      event,
      resolveNotificationPreference(byEvent.get(event), event),
    ]),
  ) as Record<NotificationEventType, NotificationChannelPrefs>;

  return (
    <AppShell>
      <div className="specs-content">
        <p className="specs-grid__meta">
          <Link href="/settings">← Workspace settings</Link>
        </p>
        <h1 className="specs-title">Notification preferences</h1>
        <p className="specs-grid__meta">
          Choose which events reach you. These apply to your account across the workspace.
        </p>
        <NotificationPreferences initial={initial} />
      </div>
    </AppShell>
  );
}
