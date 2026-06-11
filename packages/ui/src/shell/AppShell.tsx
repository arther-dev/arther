import type { ReactNode } from 'react';

export interface AppShellProps {
  /** Region 1 — icon rail (absent on Dashboard & Settings). */
  rail?: ReactNode;
  /** Region 2 — Navigator: organizes (left). */
  navigator?: ReactNode;
  /** Region 4 — Inspector: modifies (right). */
  inspector?: ReactNode;
  /** Region 3 — content area: the only region that scrolls. */
  children: ReactNode;
}

/**
 * The 5-region frame below the top bar (Handoff 02 §1). Governing principles
 * encoded here: left organizes / right modifies; only the content area
 * scrolls — chrome never scrolls out of view.
 */
export function AppShell({ rail, navigator, inspector, children }: AppShellProps) {
  return (
    <div className="ui-shell">
      {rail}
      {navigator ? (
        <aside className="ui-shell__navigator" aria-label="Navigator">
          {navigator}
        </aside>
      ) : null}
      <main className="ui-shell__content">{children}</main>
      {inspector ? (
        <aside className="ui-shell__inspector" aria-label="Inspector">
          {inspector}
        </aside>
      ) : null}
    </div>
  );
}
