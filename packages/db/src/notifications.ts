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
 * C3.1/C3.5 — write an in-app notification to each recipient (deduped). Honors the
 * in-app default (on for every event); the per-user, per-event in-app toggle
 * filter lands with the preferences UI (C3.2). Service-role only. Returns the
 * number of rows written.
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
  const { error } = await service.from('notifications').insert(
    recipients.map((recipientId) => ({
      workspace_id: input.workspaceId,
      recipient_id: recipientId,
      event_type: input.eventType,
      payload: input.payload,
    })),
  );
  if (error) throw new Error(`dispatchNotification: ${error.message}`);
  return recipients.length;
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
