'use client';

import { usePathname } from 'next/navigation';
import { TopBar } from '@arther/ui';
import type { NotificationView } from '@arther/types';
import { AccountMenu } from './AccountMenu';
import { useAssistant } from './AssistantContext';
import { NotificationBell } from './NotificationBell';

/** The active tab = the mode, derived from the route segment (Handoff 02 §3). */
const MODE_TITLES: Array<[prefix: string, title: string]> = [
  ['/dashboard', 'Dashboard'],
  ['/specs', 'Specs'],
  ['/documents', 'Documents'],
  ['/snippets', 'Snippets'],
  ['/portal', 'Portal'],
  ['/settings', 'Settings'],
  ['/design-tokens', 'Design tokens'],
];

export function ShellTopBar({
  notifications = [],
  unreadCount = 0,
}: {
  notifications?: NotificationView[];
  unreadCount?: number;
}) {
  const pathname = usePathname() ?? '/';
  const activeTab = MODE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Arther';
  const { toggle } = useAssistant();
  return (
    <TopBar
      activeTab={activeTab}
      account={<AccountMenu />}
      notifications={<NotificationBell items={notifications} unreadCount={unreadCount} />}
      searchHref="/search"
      onHelp={toggle}
    />
  );
}
