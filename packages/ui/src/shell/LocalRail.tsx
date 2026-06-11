import type { ReactNode } from 'react';

export interface RailItem {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  href?: string;
}

/**
 * Region 1 — the icon-only local rail (Handoff 02 §1/§2): switches views
 * within the current mode. Fixed (never collapses); absent on Dashboard and
 * Settings. Items are 44px (size/rail-item) with label-on-hover via title.
 */
export function LocalRail({ items, label = 'Views' }: { items: RailItem[]; label?: string }) {
  return (
    <nav className="ui-rail" aria-label={label}>
      {items.map((item) =>
        item.href ? (
          <a
            key={item.id}
            href={item.href}
            className={`ui-rail__item${item.active ? ' ui-rail__item--active' : ''}`}
            aria-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            title={item.label}
          >
            {item.icon}
          </a>
        ) : (
          <button
            key={item.id}
            type="button"
            className={`ui-rail__item${item.active ? ' ui-rail__item--active' : ''}`}
            aria-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            title={item.label}
          >
            {item.icon}
          </button>
        ),
      )}
    </nav>
  );
}
