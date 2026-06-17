'use server';

import { getActiveWorkspace, setNotificationPreference } from '@arther/db';
import { isNotificationEventType } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

/**
 * C3.2 — save one event's channel preference for the signed-in member. RLS scopes
 * the upsert to the member's own membership; the dispatch reads these to gate the
 * in-app channel (email gating arrives with C3.3).
 */
export interface PreferenceResult {
  ok: boolean;
  error?: string;
}

export async function setNotificationPreferenceAction(
  eventType: string,
  channels: { inApp: boolean; email: boolean },
): Promise<PreferenceResult> {
  if (!isNotificationEventType(eventType)) return { ok: false, error: 'Unknown event.' };
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: 'Not configured in this environment yet.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { ok: false, error: 'No workspace yet.' };

  try {
    await setNotificationPreference(supabase, {
      membershipId: workspace.membershipId,
      eventType,
      inAppEnabled: channels.inApp,
      emailEnabled: channels.email,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save your preference.' };
  }
}
