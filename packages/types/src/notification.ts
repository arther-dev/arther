/**
 * C3.1 — the unified notification model (collaboration spec §9). One pure source
 * (ADR-012, invariant 8) for the typed event registry, the in-app render strings,
 * and the email-default seed. EVERY notifying feature (review/approval transitions,
 * comments, @mentions, spec staleness) dispatches through this one model; no
 * feature defines its own. Persistence: `notifications` + `notification_preferences`
 * (migration 0007). Email delivery (Resend via Trigger.dev, C3.3) consumes the same
 * events; this slice ships the in-app path.
 */
export const NOTIFICATION_EVENT_TYPES = [
  'review_requested', // doc → Review: assigned approvers
  'document_approved', // all approvals in: owner
  'document_rejected', // sent back: owner
  'document_published', // published: owner + revision commenters
  'comment_added', // new thread on your doc: owner
  'comment_reply', // reply in a thread you're in: participants
  'comment_mention', // @mention: the mentioned member
  'spec_stale', // a spec change affects your doc (Feature 4)
  'review_overdue', // due date passed
  'snippet_override_created', // someone overrode your snippet in a doc: snippet owner (R.3)
  'snippet_source_changed', // a snippet you overrode changed at the source: the overriding doc owner (R.3)
  'snippet_stale_prose', // a spec change may have made your snippet's prose stale: snippet owner (R.9)
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Typed-ish payload (keyed on event_type); all fields optional for forward-compat. */
export interface NotificationPayload {
  documentId?: string;
  documentTitle?: string;
  actorName?: string;
  revisionId?: string;
  threadId?: string;
  /** R.3 — the library item (snippet) a notification is about. */
  libraryItemId?: string;
  snippetName?: string;
  [key: string]: unknown;
}

export interface NotificationView {
  id: string;
  eventType: NotificationEventType;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

/**
 * Email on-by-default per event (spec §9.3) — the seed for the preference model
 * (C3.2) and the email dispatch (C3.3). In-app is on by default for every event.
 */
export const EMAIL_DEFAULT_ON: Record<NotificationEventType, boolean> = {
  review_requested: true,
  document_rejected: true,
  comment_mention: true,
  review_overdue: true,
  document_approved: false,
  document_published: false,
  comment_added: false,
  comment_reply: false,
  spec_stale: false,
  // R.3 — a changed source under a live override is actionable for the doc owner
  // (accept vs. keep), so email immediately; the snippet owner's override notice
  // is informational, in-app by default.
  snippet_source_changed: true,
  snippet_override_created: false,
  // R.9 — a possibly-stale snippet is actionable for its owner (review the prose).
  snippet_stale_prose: true,
};

/** True if `value` is a known event type (guards untrusted/legacy rows). */
export function isNotificationEventType(value: unknown): value is NotificationEventType {
  return (
    typeof value === 'string' && (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** Friendly labels for the preference grid (C3.2), in a sensible display order. */
export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  review_requested: 'Review requested',
  document_approved: 'Document approved',
  document_rejected: 'Document sent back',
  document_published: 'Document published',
  comment_mention: 'You’re mentioned',
  comment_added: 'New comment on your document',
  comment_reply: 'Reply in a thread',
  spec_stale: 'A spec change affects your document',
  review_overdue: 'Review overdue',
  snippet_override_created: 'Your snippet was overridden in a document',
  snippet_source_changed: 'A snippet you overrode changed at the source',
  snippet_stale_prose: 'A spec change may have made your snippet stale',
};

export interface NotificationChannelPrefs {
  inApp: boolean;
  email: boolean;
}

/**
 * §9.3 — comment events (outside @mentions) and staleness alerts are batched into
 * a daily digest, not emailed immediately; state-transition and mention events go
 * out immediately. C3.3 sends the immediate set; the digest rides the C3.6 cron.
 */
export const EMAIL_BATCHED: ReadonlySet<NotificationEventType> = new Set<NotificationEventType>([
  'comment_added',
  'comment_reply',
  'spec_stale',
]);

/** True if this event emails immediately (vs. batched into the daily digest). */
export function isImmediateEmailEvent(eventType: NotificationEventType): boolean {
  return !EMAIL_BATCHED.has(eventType);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * C3.3 — the email rendering for a notification: subject + text + html, with an
 * absolute deep link. Pure (reuses `describeNotification`); user-supplied fields
 * (document title, actor) are HTML-escaped in the html body.
 */
export function renderNotificationEmail(
  eventType: NotificationEventType,
  payload: NotificationPayload,
  appBaseUrl: string,
): { subject: string; text: string; html: string } {
  const { title, href } = describeNotification(eventType, payload);
  const base = appBaseUrl.replace(/\/$/, '');
  const url = href ? `${base}${href}` : base || '#';
  return {
    subject: title,
    text: `${title}\n\nOpen in Arther: ${url}`,
    html: `<p>${escapeHtml(title)}</p><p><a href="${escapeHtml(url)}">Open in Arther</a></p>`,
  };
}

/**
 * C3.2 — the effective channel preferences for an event: a stored row when the
 * member set one, else the defaults (in-app on for everything; email per
 * `EMAIL_DEFAULT_ON`). Pure so the settings UI and the dispatch agree.
 */
export function resolveNotificationPreference(
  stored: { inAppEnabled: boolean; emailEnabled: boolean } | undefined,
  eventType: NotificationEventType,
): NotificationChannelPrefs {
  if (stored) return { inApp: stored.inAppEnabled, email: stored.emailEnabled };
  return { inApp: true, email: EMAIL_DEFAULT_ON[eventType] };
}

/**
 * Pure — the in-app render for a notification: a title and a deep link (or null).
 * The notification centre and any future channel (Slack, §9.3) read from here so
 * the wording is defined once.
 */
export function describeNotification(
  eventType: NotificationEventType,
  payload: NotificationPayload,
): { title: string; href: string | null } {
  const doc = payload.documentTitle ?? 'a document';
  const who = payload.actorName ?? 'Someone';
  const snippet = payload.snippetName ?? 'a snippet';
  const href = payload.documentId ? `/documents/${payload.documentId}` : null;
  const snippetHref = payload.libraryItemId ? `/snippets/${payload.libraryItemId}` : null;
  switch (eventType) {
    case 'review_requested':
      return { title: `Review requested: ${doc}`, href };
    case 'document_approved':
      return { title: `${doc} was approved`, href };
    case 'document_rejected':
      return { title: `${doc} was sent back to draft`, href };
    case 'document_published':
      return { title: `${doc} was published`, href };
    case 'comment_added':
      return { title: `New comment on ${doc}`, href };
    case 'comment_reply':
      return { title: `New reply on ${doc}`, href };
    case 'comment_mention':
      return { title: `${who} mentioned you on ${doc}`, href };
    case 'spec_stale':
      return { title: `A spec change affects ${doc}`, href };
    case 'review_overdue':
      return { title: `Review overdue: ${doc}`, href };
    case 'snippet_override_created':
      // The snippet owner: link to their snippet (they may not own the document).
      return { title: `${who} overrode “${snippet}” in ${doc}`, href: snippetHref ?? href };
    case 'snippet_source_changed':
      // The overriding doc owner: link to the document to accept or keep the override.
      return { title: `“${snippet}” changed after you overrode it in ${doc}`, href };
    case 'snippet_stale_prose':
      // The snippet owner: link to the snippet to review/refresh its prose.
      return { title: `“${snippet}” may be stale after a spec change`, href: snippetHref ?? href };
    default:
      return { title: 'Notification', href };
  }
}
