import { describe, expect, it } from 'vitest';
import {
  describeNotification,
  EMAIL_DEFAULT_ON,
  isNotificationEventType,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES,
  resolveNotificationPreference,
} from './notification';

describe('describeNotification (C3.1)', () => {
  const payload = { documentId: 'doc-1', documentTitle: 'Datasheet', actorName: 'Alex' };

  it('renders a title + deep link for each event', () => {
    expect(describeNotification('review_requested', payload)).toEqual({
      title: 'Review requested: Datasheet',
      href: '/documents/doc-1',
    });
    expect(describeNotification('comment_mention', payload).title).toBe('Alex mentioned you on Datasheet');
    expect(describeNotification('document_rejected', payload).title).toContain('sent back');
  });

  it('falls back gracefully with a sparse payload', () => {
    const r = describeNotification('review_requested', {});
    expect(r.title).toBe('Review requested: a document');
    expect(r.href).toBeNull();
  });

  it('covers every event type (no event renders the default)', () => {
    for (const event of NOTIFICATION_EVENT_TYPES) {
      expect(describeNotification(event, payload).title).not.toBe('Notification');
    }
  });
});

describe('event-type registry', () => {
  it('guards unknown values', () => {
    expect(isNotificationEventType('review_requested')).toBe(true);
    expect(isNotificationEventType('made_up')).toBe(false);
    expect(isNotificationEventType(42)).toBe(false);
  });

  it('email defaults match spec §9.3 (mentions + review/reject/overdue on)', () => {
    expect(EMAIL_DEFAULT_ON.review_requested).toBe(true);
    expect(EMAIL_DEFAULT_ON.comment_mention).toBe(true);
    expect(EMAIL_DEFAULT_ON.comment_added).toBe(false);
    expect(EMAIL_DEFAULT_ON.spec_stale).toBe(false);
    // every event has an explicit default + label
    for (const event of NOTIFICATION_EVENT_TYPES) {
      expect(typeof EMAIL_DEFAULT_ON[event]).toBe('boolean');
      expect(NOTIFICATION_EVENT_LABELS[event]).toBeTruthy();
    }
  });
});

describe('resolveNotificationPreference (C3.2)', () => {
  it('falls back to defaults when no row is stored', () => {
    expect(resolveNotificationPreference(undefined, 'comment_added')).toEqual({
      inApp: true,
      email: false,
    });
    expect(resolveNotificationPreference(undefined, 'comment_mention')).toEqual({
      inApp: true,
      email: true,
    });
  });

  it('honors a stored row over the defaults', () => {
    expect(
      resolveNotificationPreference({ inAppEnabled: false, emailEnabled: true }, 'comment_added'),
    ).toEqual({ inApp: false, email: true });
  });
});
