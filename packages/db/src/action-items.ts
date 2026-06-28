import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardActionItem } from '@arther/types';

/**
 * G6.5 — the action dashboard data layer over `dashboard_action_items` (written
 * by the propagation engine, G6.2). The queue is PERSONAL: every read is scoped
 * to the caller (`assigned_to == me`) on top of the member-read RLS, newest
 * first. Resolving is editor-gated + workspace-scoped by `dai_write` RLS.
 */

export type ActionItemRow = DashboardActionItem;

function mapRow(r: Record<string, unknown>): ActionItemRow {
  return {
    id: r.id as string,
    type: r.type as ActionItemRow['type'],
    title: r.title as string,
    context: (r.context as string | null) ?? null,
    documentId: (r.document_id as string | null) ?? null,
    referenceId: r.reference_id as string,
    status: r.status as 'pending' | 'resolved',
    createdAt: r.created_at as string,
  };
}

/**
 * The current user's action queue. `dai_read` RLS already scopes rows to the
 * caller's workspaces; the `assigned_to` filter makes the queue personal. Pending
 * only, unless `includeResolved` (the "Show resolved" toggle).
 */
export async function listActionItems(
  client: SupabaseClient,
  opts: { includeResolved?: boolean } = {},
): Promise<ActionItemRow[]> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];

  let query = client
    .from('dashboard_action_items')
    .select('id, type, title, context, document_id, reference_id, status, created_at')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false });
  if (!opts.includeResolved) query = query.eq('status', 'pending');

  const { data, error } = await query;
  if (error) throw new Error(`listActionItems: ${error.message}`);
  return (data ?? []).map(mapRow);
}

/**
 * Mark a queue item done (or reopen it). `dai_write` RLS is editor-gated and
 * workspace-scoped, so a caller can only touch items in a workspace they edit.
 */
export async function setActionItemStatus(
  client: SupabaseClient,
  id: string,
  status: 'pending' | 'resolved',
): Promise<void> {
  const { error } = await client.from('dashboard_action_items').update({ status }).eq('id', id);
  if (error) throw new Error(`setActionItemStatus: ${error.message}`);
}
