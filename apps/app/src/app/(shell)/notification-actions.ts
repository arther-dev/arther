'use server';

import { markAllNotificationsRead, markNotificationRead } from '@arther/db';
import { getSupabaseServer } from '../../lib/supabase/server';

/**
 * C3.4 — read-state actions for the notification centre. RLS scopes every write
 * to `recipient_id = auth.uid()`, so a member can only mark their own read.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markReadAction(notificationId: string): Promise<void> {
  if (!UUID_RE.test(notificationId)) return;
  const supabase = await getSupabaseServer();
  if (!supabase) return;
  await markNotificationRead(supabase, notificationId);
}

export async function markAllReadAction(): Promise<void> {
  const supabase = await getSupabaseServer();
  if (!supabase) return;
  await markAllNotificationsRead(supabase);
}
