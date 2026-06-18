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

/**
 * C9.6 — the portal consumption events (anonymous): a view, a PDF download (C5),
 * or a search. Identity is a `session_id` (anonymous) and, for gated docs, the
 * `magic_link_id`; never an `actor_user_id`. Same append-only, service-role store.
 */
export type PortalAnalyticsEventType =
  | 'document_viewed'
  | 'document_downloaded'
  | 'portal_searched';

export interface PortalAnalyticsEvent {
  eventType: PortalAnalyticsEventType;
  documentId?: DocumentId | null;
  sessionId?: string | null;
  magicLinkId?: string | null;
  payload?: Record<string, unknown>;
}

export async function recordPortalEvent(
  service: SupabaseClient,
  scope: WorkspaceScope,
  event: PortalAnalyticsEvent,
): Promise<void> {
  await scopedServiceQuery(scope, async ({ workspaceId }) => {
    const { error } = await service.from('analytics_events').insert({
      workspace_id: workspaceId,
      event_type: event.eventType,
      document_id: event.documentId ?? null,
      session_id: event.sessionId ?? null,
      magic_link_id: event.magicLinkId ?? null,
      payload: event.payload ?? {},
    });
    if (error) throw new Error(`recordPortalEvent: ${error.message}`);
  });
}

/**
 * A.5 — the per-document consumption panel's metrics: portal views, unique
 * anonymous visitors (distinct session), downloads, and identified viewers
 * (distinct magic-link recipients, for gated docs). One SQL aggregate over the
 * events store (the `document_consumption` RPC, 0024) — SECURITY INVOKER, so the
 * caller's RLS scopes it to their workspace. Read through the user-JWT client.
 */
export interface DocumentConsumption {
  views: number;
  uniqueVisitors: number;
  downloads: number;
  identifiedViewers: number;
}

export async function getDocumentConsumption(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<DocumentConsumption> {
  const { data, error } = await client.rpc('document_consumption', { p_document_id: documentId });
  if (error) throw new Error(`getDocumentConsumption: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        views: number | string;
        unique_visitors: number | string;
        downloads: number | string;
        identified_viewers: number | string;
      }
    | undefined;
  const n = (v: number | string | null | undefined): number => Number(v ?? 0);
  return {
    views: n(row?.views),
    uniqueVisitors: n(row?.unique_visitors),
    downloads: n(row?.downloads),
    identifiedViewers: n(row?.identified_viewers),
  };
}
