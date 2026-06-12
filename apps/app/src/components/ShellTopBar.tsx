'use client';

import { usePathname } from 'next/navigation';
import { TopBar } from '@arther/ui';
import { AccountMenu } from './AccountMenu';

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

export function ShellTopBar() {
  const pathname = usePathname() ?? '/';
  const activeTab = MODE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Arther';
  return <TopBar activeTab={activeTab} account={<AccountMenu />} />;
}
