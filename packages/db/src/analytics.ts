import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentId, UserId } from '@arther/types';
import { scopedServiceQuery, type WorkspaceScope } from './guard';

/**
 * G8.2 — the workspace analytics events the app emits (the 0011 `analytics_events`
 * envelope; spec lists these as the workspace event types). Portal events
 * (document_viewed/…) are emitted by the portal at C-track; these are the app-side
 * metering/observability hooks. Metrics are SQL aggregates over the store.
 */
export type AnalyticsEventType =
  | 'document_generated'
  | 'document_state_changed'
  | 'block_regenerated'
  | 'spec_field_updated';

export interface AnalyticsEvent {
  eventType: AnalyticsEventType;
  actorUserId?: UserId | null;
  documentId?: DocumentId | null;
  payload?: Record<string, unknown>;
}

/**
 * Append one workspace analytics event. Written through the **service role** —
 * `analytics_events` has no authenticated INSERT policy (events come from trusted
 * server paths only) and is append-only (0011 mutation guards). Every write is
 * workspace-scoped (guardrail 1). Best-effort at the call site: a metering write
 * must never fail the user action.
 */
export async function recordAnalyticsEvent(
  service: SupabaseClient,
  scope: WorkspaceScope,
  event: AnalyticsEvent,
): Promise<void> {
  await scopedServiceQuery(scope, async ({ workspaceId }) => {
    const { error } = await service.from('analytics_events').insert({
      workspace_id: workspaceId,
      event_type: event.eventType,
      actor_user_id: event.actorUserId ?? null,
      document_id: event.documentId ?? null,
      payload: event.payload ?? {},
    });
    if (error) throw new Error(`recordAnalyticsEvent: ${error.message}`);
  });
}
