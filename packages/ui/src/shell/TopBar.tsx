import type { ReactNode } from 'react';
import { BellIcon, ChevronDownIcon, HelpIcon, PlusIcon, SearchIcon } from './icons';

export interface TopBarProps {
  /** Title of the active tab (the active tab = the mode; Handoff 02 §3). */
  activeTab: string;
  /** Connectivity chip state (real state arrives with G5.3). */
  connectivity?: 'connected' | 'saving' | 'offline';
  /** Account affordance (menu); falls back to the bare avatar button. */
  account?: ReactNode;
  /** Notification affordance (bell + unread badge, C3.4); falls back to a bare bell. */
  notifications?: ReactNode;
  /** Where the ⌘K search control navigates (G4.7); a bare button when unset. */
  searchHref?: string;
  /** Toggle the Ask Arther assistant panel (⌘J / Help, K.1). */
  onHelp?: () => void;
  /** Slot for future tab-strip items beyond the active one. */
  children?: ReactNode;
}

/**
 * Region 0 — persistent top bar (Handoff 02 §1): identity/module switcher ·
 * universal tabs · ⌘K · utility cluster. The tab system itself (per-user
 * persistence, launcher, overflow) is later work; this renders the frame with
 * the accessibility contract (aria-labels, ≥24px hit areas) in place.
 */
export function TopBar({
  activeTab,
  connectivity = 'connected',
  account,
  notifications,
  searchHref,
  onHelp,
  children,
}: TopBarProps) {
  const connectivityLabel =
    connectivity === 'connected' ? 'Connected' : connectivity === 'saving' ? 'Saving…' : 'Offline';
  return (
    <header className="ui-topbar">
      <button type="button" className="ui-topbar__brand" aria-label="Switch module">
        <span className="ui-topbar__wordmark">Arther</span>
        <ChevronDownIcon />
      </button>

      <nav className="ui-topbar__tabs" aria-label="Open tabs">
        <span className="ui-tab-chip ui-tab-chip--active" aria-current="page">
          {activeTab}
        </span>
        {children}
        <button type="button" className="ui-icon-btn" aria-label="Open new tab">
          <PlusIcon />
        </button>
      </nav>

      <div className="ui-topbar__utils">
        {searchHref ? (
          <a href={searchHref} className="ui-icon-btn" aria-label="Search (⌘K)">
            <SearchIcon />
          </a>
        ) : (
          <button type="button" className="ui-icon-btn" aria-label="Search (⌘K)">
            <SearchIcon />
          </button>
        )}
        {notifications ?? (
          <button type="button" className="ui-icon-btn" aria-label="Notifications">
            <BellIcon />
          </button>
        )}
        <button type="button" className="ui-icon-btn" aria-label="Ask Arther (⌘J)" onClick={onHelp}>
          <HelpIcon />
        </button>
        <span
          className={`ui-conn-chip ui-conn-chip--${connectivity}`}
          role="status"
          aria-label={`Connection status: ${connectivityLabel}`}
        >
          {connectivityLabel}
        </span>
        {account ?? <button type="button" className="ui-topbar__avatar" aria-label="Account" />}
      </div>
    </header>
  );
}
