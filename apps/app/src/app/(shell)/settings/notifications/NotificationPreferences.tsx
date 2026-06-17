'use client';

import { useState, useTransition } from 'react';
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannelPrefs,
  type NotificationEventType,
} from '@arther/types';
import { setNotificationPreferenceAction } from './notification-preference-actions';

/**
 * C3.2 — the per-event notification preference grid (in-app · email). Each toggle
 * persists immediately (optimistic, reverting on failure). Email gating is wired
 * into the model now; the email channel itself ships with C3.3 — the column is
 * labelled accordingly.
 */
export function NotificationPreferences({
  initial,
}: {
  initial: Record<NotificationEventType, NotificationChannelPrefs>;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(event: NotificationEventType, channel: 'inApp' | 'email', value: boolean) {
    const previous = prefs[event];
    const next = { ...previous, [channel]: value };
    setPrefs((p) => ({ ...p, [event]: next })); // optimistic
    setError(null);
    start(async () => {
      const result = await setNotificationPreferenceAction(event, next);
      if (!result.ok) {
        setPrefs((p) => ({ ...p, [event]: previous })); // revert
        setError(result.error ?? 'Could not save your preference.');
      }
    });
  }

  return (
    <div>
      <table className="specs-grid notif-prefs">
        <thead>
          <tr>
            <th scope="col">Event</th>
            <th scope="col">In-app</th>
            <th scope="col">Email</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_EVENT_TYPES.map((event) => (
            <tr key={event}>
              <td>{NOTIFICATION_EVENT_LABELS[event]}</td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`${NOTIFICATION_EVENT_LABELS[event]} — in-app`}
                  checked={prefs[event].inApp}
                  disabled={pending}
                  onChange={(e) => toggle(event, 'inApp', e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`${NOTIFICATION_EVENT_LABELS[event]} — email`}
                  checked={prefs[event].email}
                  disabled={pending}
                  onChange={(e) => toggle(event, 'email', e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="specs-grid__meta">
        In-app delivery is live now; email delivery follows (C3.3). Preferences apply across the
        workspace for your account.
      </p>
      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
