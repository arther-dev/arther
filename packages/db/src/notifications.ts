import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@arther/config';
import {
  isImmediateEmailEvent,
  isNotificationEventType,
  renderNotificationEmail,
  resolveNotificationPreference,
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
 * honoring each recipient's per-event preferences (C3.2/C3.3): in-app rows for
 * those with the in-app channel on (default on), and — for immediate-delivery
 * events (§9.3) — an email to those with the email channel on (default per
 * `EMAIL_DEFAULT_ON`). Recipients are confirmed members of the workspace, so a
 * stale/foreign id never receives one. Email is gated on `RESEND_API_KEY` (no key
 * → in-app only). Service-role only. Returns the number of in-app rows written.
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

  // The recipients' stored prefs for this event (absent = defaults).
  const prefByMembership = new Map<string, { inAppEnabled: boolean; emailEnabled: boolean }>();
  const membershipIds = [...membershipByUser.values()];
  if (membershipIds.length > 0) {
    const { data: prefs, error: pErr } = await service
      .from('notification_preferences')
      .select('workspace_member_id, in_app_enabled, email_enabled')
      .eq('event_type', input.eventType)
      .in('workspace_member_id', membershipIds);
    if (pErr) throw new Error(`dispatchNotification.prefs: ${pErr.message}`);
    for (const row of (prefs ?? []) as Array<Record<string, unknown>>) {
      prefByMembership.set(row.workspace_member_id as string, {
        inAppEnabled: row.in_app_enabled as boolean,
        emailEnabled: row.email_enabled as boolean,
      });
    }
  }

  const inAppRecipients: string[] = [];
  const emailRecipients: string[] = [];
  const immediate = isImmediateEmailEvent(input.eventType);
  for (const uid of recipients) {
    const membershipId = membershipByUser.get(uid);
    if (membershipId == null) continue; // not a member of this workspace
    const channels = resolveNotificationPreference(prefByMembership.get(membershipId), input.eventType);
    if (channels.inApp) inAppRecipients.push(uid);
    if (channels.email && immediate) emailRecipients.push(uid);
  }

  let written = 0;
  if (inAppRecipients.length > 0) {
    const { error } = await service.from('notifications').insert(
      inAppRecipients.map((recipientId) => ({
        workspace_id: input.workspaceId,
        recipient_id: recipientId,
        event_type: input.eventType,
        payload: input.payload,
      })),
    );
    if (error) throw new Error(`dispatchNotification: ${error.message}`);
    written = inAppRecipients.length;
  }

  await sendNotificationEmails(service, emailRecipients, input.eventType, input.payload);
  return written;
}

/**
 * C3.3 — the email channel of the dispatch fan-out (ADR-011: Resend, no SDK, one
 * fetch; gated on `RESEND_API_KEY`). Sends the same rendered email to each
 * recipient. Best-effort — a send failure never affects the in-app rows. (The
 * durable Trigger.dev task + the batched daily digest are C3.6 follow-ups.)
 */
async function sendNotificationEmails(
  service: SupabaseClient,
  recipientUserIds: string[],
  eventType: NotificationEventType,
  payload: NotificationPayload,
): Promise<void> {
  if (!process.env.RESEND_API_KEY || recipientUserIds.length === 0) return;

  const { data: users, error } = await service
    .from('users')
    .select('email')
    .in('id', recipientUserIds);
  if (error) return; // best-effort
  const { subject, text, html } = renderNotificationEmail(
    eventType,
    payload,
    process.env.APP_URL ?? '',
  );
  await Promise.all(
    ((users ?? []) as Array<{ email: string | null }>)
      .filter((row) => row.email)
      .map((row) => sendEmail({ to: row.email!, subject, text, html })),
  );
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
  // Independent reads on every shell render — fire them together.
  const [
    { data, error },
    { count, error: countErr },
  ] = await Promise.all([
    client
      .from('notifications')
      .select('id, event_type, payload, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ]);
  if (error) throw new Error(`getNotificationFeed: ${error.message}`);
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
