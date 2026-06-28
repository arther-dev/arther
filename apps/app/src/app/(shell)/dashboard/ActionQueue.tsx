import Link from 'next/link';
import {
  ACTION_ITEM_META,
  actionItemCtaLabel,
  actionItemHref,
  type ActionItemGroup,
  type ActionItemStats,
} from '@arther/types';
import { reopenActionItemAction, resolveActionItemAction } from './action-item-actions';

/**
 * G6.5 — the personal action queue: a stat-tile row + typed cards grouped by
 * type (urgency order, newest-first within), each with its owning-surface link
 * and a resolve/reopen control. The grouping/ordering/routing logic is pure in
 * `@arther/types`; this renders it. The full git-diff review modal and inline
 * override editor (IA §6) are follow-ups gated on G6.4.
 */

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function when(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : DATE_FMT.format(t);
}

export function ActionQueue({
  groups,
  stats,
  includeResolved,
}: {
  groups: ActionItemGroup[];
  stats: ActionItemStats;
  includeResolved: boolean;
}) {
  return (
    <div className="dash-queue">
      <ul className="dash-tiles" aria-label="At a glance">
        <li className="dash-tile">
          <span className="dash-tile__n">{stats.approvals}</span>
          <span className="dash-tile__l">Awaiting your approval</span>
        </li>
        <li className="dash-tile">
          <span className="dash-tile__n">{stats.reviews}</span>
          <span className="dash-tile__l">Section &amp; snippet reviews</span>
        </li>
        <li className="dash-tile">
          <span className="dash-tile__n">{stats.overrides}</span>
          <span className="dash-tile__l">Override reviews</span>
        </li>
        <li className="dash-tile">
          <span className="dash-tile__n">{stats.total}</span>
          <span className="dash-tile__l">All pending</span>
        </li>
      </ul>

      <div className="dash-queue__bar">
        <h2 className="specs-section__title">Your queue</h2>
        <Link
          className="ui-btn ui-btn--ghost ui-btn--sm"
          href={includeResolved ? '/dashboard' : '/dashboard?resolved=1'}
        >
          {includeResolved ? 'Hide resolved' : 'Show resolved'}
        </Link>
      </div>

      {groups.map((group) => (
        <section key={group.type} className="specs-section" aria-label={group.title}>
          <h3 className="specs-section__title">
            {group.title} <span className="specs-grid__meta">({group.items.length})</span>
          </h3>
          <ul className="dash-cards">
            {group.items.map((item) => {
              const resolved = item.status === 'resolved';
              return (
                <li key={item.id} className="dash-card" data-resolved={resolved ? 'true' : undefined}>
                  <div className="dash-card__body">
                    <div className="dash-card__head">
                      <span className="specs-release__tag">{ACTION_ITEM_META[item.type].label}</span>
                      <span className="specs-grid__meta">{when(item.createdAt)}</span>
                    </div>
                    <p className="dash-card__title">{item.title}</p>
                    {item.context ? <p className="specs-grid__meta">{item.context}</p> : null}
                  </div>
                  <div className="dash-card__actions">
                    <Link className="ui-btn ui-btn--secondary ui-btn--sm" href={actionItemHref(item)}>
                      {actionItemCtaLabel(item.type)}
                    </Link>
                    <form action={resolved ? reopenActionItemAction : resolveActionItemAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                        {resolved ? 'Reopen' : 'Mark done'}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
