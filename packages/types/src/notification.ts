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
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Typed-ish payload (keyed on event_type); all fields optional for forward-compat. */
export interface NotificationPayload {
  documentId?: string;
  documentTitle?: string;
  actorName?: string;
  revisionId?: string;
  threadId?: string;
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
  const href = payload.documentId ? `/documents/${payload.documentId}` : null;
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
    default:
      return { title: 'Notification', href };
  }
}
