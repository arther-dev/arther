'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@arther/ui';
import { describeNotification, type NotificationView } from '@arther/types';
import { markAllReadAction, markReadAction } from '../app/(shell)/notification-actions';

/**
 * C3.4 — the in-app notification centre in the top bar's utility cluster: a bell
 * with an unread badge and a `<details>` popover listing recent events (newest
 * first), each a deep link that marks itself read, plus bulk mark-as-read. Data
 * is fetched server-side in the shell layout and passed down.
 */
export function NotificationBell({
  items,
  unreadCount,
}: {
  items: NotificationView[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function markAll() {
    start(async () => {
      await markAllReadAction();
      router.refresh();
    });
  }

  function open(id: string, href: string | null) {
    start(async () => {
      await markReadAction(id);
      if (href) router.push(href);
      else router.refresh();
    });
  }

  return (
    <details className="ui-account-menu notif">
      <summary className="ui-icon-btn notif__trigger" aria-label={`Notifications (${unreadCount} unread)`}>
        <BellIcon />
        {unreadCount > 0 && <span className="notif__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </summary>
      <div className="ui-account-menu__panel notif__panel" role="menu">
        <div className="notif__head">
          <span className="notif__title">Notifications</span>
          {unreadCount > 0 && (
            <button type="button" className="ui-btn ui-btn--ghost" disabled={pending} onClick={markAll}>
              Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="notif__empty">You’re all caught up.</p>
        ) : (
          <ul className="notif__list">
            {items.map((n) => {
              const { title, href } = describeNotification(n.eventType, n.payload);
              const unread = n.readAt == null;
              return (
                <li key={n.id} className={`notif__item ${unread ? 'notif__item--unread' : ''}`}>
                  {href ? (
                    <Link
                      role="menuitem"
                      className="notif__link"
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        open(n.id, href);
                      }}
                    >
                      {title}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      className="notif__link"
                      onClick={() => open(n.id, null)}
                    >
                      {title}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
