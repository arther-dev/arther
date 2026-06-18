import Link from 'next/link';
import type { FirstRunChecklistItem } from '@arther/types';

/**
 * K.8 — the admin first-run setup checklist (rendered on the dashboard only while
 * incomplete, and only for owners/admins). Non-gating: it never blocks anything,
 * and it disappears once every step is done. Each undone step links straight to
 * where it's configured.
 */
export function FirstRunChecklist({
  items,
  remaining,
}: {
  items: FirstRunChecklistItem[];
  remaining: number;
}) {
  return (
    <section className="specs-section" aria-label="Workspace setup">
      <h2 className="specs-section__title">Finish setting up your workspace</h2>
      <p className="specs-grid__meta">
        {remaining} step{remaining === 1 ? '' : 's'} left to get Arther generating on-brand,
        reviewable documents. Optional — this disappears once you’re set up.
      </p>
      <ul className="specs-form" aria-label="Setup steps">
        {items.map((item) => (
          <li key={item.key} className="specs-release">
            <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
            <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
              <strong>{item.label}</strong>{' '}
              <span className="specs-grid__meta">— {item.description}</span>
            </span>
            {item.done ? (
              <span className="specs-release__tag">done</span>
            ) : (
              <Link className="ui-btn ui-btn--secondary ui-btn--sm" href={item.href}>
                Set up
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
