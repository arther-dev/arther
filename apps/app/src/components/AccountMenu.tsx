'use client';

import Link from 'next/link';
import { logOut } from '../app/(auth)/actions';

/**
 * Account affordance in the top bar's utility cluster (F4.5): Settings +
 * Log out behind the avatar. A native <details> popover — no portal/focus
 * machinery needed at this size, and it closes on outside click via the
 * platform.
 */
export function AccountMenu() {
  return (
    <details className="ui-account-menu">
      <summary className="ui-topbar__avatar ui-account-menu__trigger" aria-label="Account" />
      <div className="ui-account-menu__panel" role="menu">
        <Link role="menuitem" className="ui-account-menu__item" href="/settings">
          Workspace settings
        </Link>
        <form action={logOut} role="none">
          <button type="submit" role="menuitem" className="ui-account-menu__item">
            Log out
          </button>
        </form>
      </div>
    </details>
  );
}
