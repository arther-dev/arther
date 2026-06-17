import type { SupabaseClient } from '@supabase/supabase-js';
import { scopedServiceQuery, type WorkspaceScope } from './guard';

/**
 * The audit_log (migration 0001) is the immutable compliance trail — deny-all to
 * clients, append-only by trigger. Trusted server paths write through this
 * service-role helper (the analytics-emit pattern). Most lifecycle audit rows are
 * written inside their RPCs (definer); this covers the app-layer events that have
 * no RPC, e.g. an approver's minor correction during Review (C1.4).
 */
export interface AuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(
  service: SupabaseClient,
  scope: WorkspaceScope,
  event: AuditEvent,
): Promise<void> {
  await scopedServiceQuery(scope, async ({ workspaceId }) => {
    const { error } = await service.from('audit_log').insert({
      workspace_id: workspaceId,
      actor_id: event.actorUserId ?? null,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId ?? null,
      metadata: event.metadata ?? {},
    });
    if (error) throw new Error(`recordAuditEvent: ${error.message}`);
  });
}
