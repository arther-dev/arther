import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isNotificationEventType,
  type NotificationEventType,
  type NotificationPayload,
  type NotificationView,
  type UserId,
  type WorkspaceId,
} from '@arther/types';

/**
 * C3 — the unified notification system's data path (collaboration spec §9; schema
 * in 0007). `notifications` is recipient-RLS for reads/mark-read but has NO
 * authenticated INSERT policy — writes come from the dispatch under the SERVICE
 * client (the producer runs under a user JWT, then dispatches with service rights),
 * so this is the one write path every feature uses (invariant 8). This slice ships
 * the in-app rows; email fan-out (Resend via Trigger.dev, C3.3) is a follow-up.
 */

/**
 * C3.1/C3.2/C3.5 — write an in-app notification to each recipient (deduped),
 * honoring their per-event in-app preference (C3.2): a recipient who turned the
 * event's in-app channel off is skipped (default = on). Recipients are also
 * confirmed members of the workspace, so a stale/foreign id never receives one.
 * Service-role only. Returns the number of rows written.
 */
export async function dispatchNotification(
  service: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    recipientIds: string[];
    eventType: NotificationEventType;
    payload: NotificationPayload;
  },
): Promise<number> {
  const recipients = [...new Set(input.recipientIds)].filter((id) => id.length > 0);
  if (recipients.length === 0) return 0;

  // Map recipients → their membership in this workspace (drops non-members).
  const { data: members, error: mErr } = await service
    .from('workspace_members')
    .select('id, user_id')
    .eq('workspace_id', input.workspaceId)
    .in('user_id', recipients);
  if (mErr) throw new Error(`dispatchNotification.members: ${mErr.message}`);
  const membershipByUser = new Map<string, string>();
  for (const m of (members ?? []) as Array<{ id: string; user_id: string }>) {
    membershipByUser.set(m.user_id, m.id);
  }

  // Memberships that have turned this event's in-app channel OFF (default on).
  let disabled = new Set<string>();
  const membershipIds = [...membershipByUser.values()];
  if (membershipIds.length > 0) {
    const { data: off, error: pErr } = await service
      .from('notification_preferences')
      .select('workspace_member_id')
      .eq('event_type', input.eventType)
      .eq('in_app_enabled', false)
      .in('workspace_member_id', membershipIds);
    if (pErr) throw new Error(`dispatchNotification.prefs: ${pErr.message}`);
    disabled = new Set((off ?? []).map((r) => r.workspace_member_id as string));
  }

  const enabled = recipients.filter((uid) => {
    const membershipId = membershipByUser.get(uid);
    return membershipId != null && !disabled.has(membershipId);
  });
  if (enabled.length === 0) return 0;

  const { error } = await service.from('notifications').insert(
    enabled.map((recipientId) => ({
      workspace_id: input.workspaceId,
      recipient_id: recipientId,
      event_type: input.eventType,
      payload: input.payload,
    })),
  );
  if (error) throw new Error(`dispatchNotification: ${error.message}`);
  return enabled.length;
}

export interface StoredNotificationPreference {
  eventType: NotificationEventType;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

/** C3.2 — a member's stored notification preferences (rows they've customised). */
export async function listNotificationPreferences(
  client: SupabaseClient,
  membershipId: string,
): Promise<StoredNotificationPreference[]> {
  const { data, error } = await client
    .from('notification_preferences')
    .select('event_type, in_app_enabled, email_enabled')
    .eq('workspace_member_id', membershipId);
  if (error) throw new Error(`listNotificationPreferences: ${error.message}`);
  const out: StoredNotificationPreference[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (!isNotificationEventType(row.event_type)) continue;
    out.push({
      eventType: row.event_type,
      inAppEnabled: row.in_app_enabled as boolean,
      emailEnabled: row.email_enabled as boolean,
    });
  }
  return out;
}

/** C3.2 — upsert a member's preference for one event (RLS: own membership only). */
export async function setNotificationPreference(
  client: SupabaseClient,
  input: {
    membershipId: string;
    eventType: NotificationEventType;
    inAppEnabled: boolean;
    emailEnabled: boolean;
  },
): Promise<void> {
  const { error } = await client.from('notification_preferences').upsert(
    {
      workspace_member_id: input.membershipId,
      event_type: input.eventType,
      in_app_enabled: input.inAppEnabled,
      email_enabled: input.emailEnabled,
    },
    { onConflict: 'workspace_member_id,event_type' },
  );
  if (error) throw new Error(`setNotificationPreference: ${error.message}`);
}

export interface NotificationFeed {
  items: NotificationView[];
  unreadCount: number;
}

/**
 * C3.4 — the signed-in member's recent notifications (newest first) + the total
 * unread count for the badge. RLS scopes both reads to `recipient_id = auth.uid()`.
 */
export async function getNotificationFeed(
  client: SupabaseClient,
  options: { limit?: number } = {},
): Promise<NotificationFeed> {
  const limit = options.limit ?? 20;
  const { data, error } = await client
    .from('notifications')
    .select('id, event_type, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getNotificationFeed: ${error.message}`);

  const { count, error: countErr } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (countErr) throw new Error(`getNotificationFeed.count: ${countErr.message}`);

  const items: NotificationView[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (!isNotificationEventType(row.event_type)) continue; // skip legacy/unknown
    items.push({
      id: row.id as string,
      eventType: row.event_type,
      payload: (row.payload as NotificationPayload) ?? {},
      readAt: (row.read_at as string | null) ?? null,
      createdAt: row.created_at as string,
    });
  }
  return { items, unreadCount: count ?? 0 };
}

/** C3.4 — mark a single notification read (recipient-RLS; idempotent). */
export async function markNotificationRead(client: SupabaseClient, notificationId: string): Promise<void> {
  const { error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);
  if (error) throw new Error(`markNotificationRead: ${error.message}`);
}

/** C3.4 — bulk mark-as-read for the signed-in member (RLS scopes to recipient). */
export async function markAllNotificationsRead(client: SupabaseClient): Promise<void> {
  const { error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw new Error(`markAllNotificationsRead: ${error.message}`);
}

/** Resolve workspace-member ids → distinct user ids (notification recipients). */
export async function membershipUserIds(
  client: SupabaseClient,
  membershipIds: string[],
): Promise<UserId[]> {
  const ids = [...new Set(membershipIds)];
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from('workspace_members')
    .select('user_id')
    .in('id', ids);
  if (error) throw new Error(`membershipUserIds: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.user_id as UserId))];
}

/**
 * C2.5 — the subset of `userIds` who are members of `workspaceId`. @mentions
 * resolve to workspace members only (collab spec §8), so a token naming a
 * non-member (or a member of another workspace) never produces a notification.
 */
export async function workspaceMemberUserIds(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
  userIds: string[],
): Promise<UserId[]> {
  const ids = [...new Set(userIds)].filter((id) => id.length > 0);
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .in('user_id', ids);
  if (error) throw new Error(`workspaceMemberUserIds: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.user_id as UserId))];
}
