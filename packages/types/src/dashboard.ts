/**
 * G6.5 — the action dashboard taxonomy + pure presentation logic
 * (arther-dashboard-ia.md). The Dashboard is the personal "what needs me now"
 * queue: seven typed item types, grouped by type and ordered by urgency, each
 * with an interaction mode. The rows (`dashboard_action_items`) are written by
 * the propagation engine (G6.2) and routed to the resolved domain owner (G6.3);
 * these helpers shape that data for the queue. Pure + unit-tested — the app reads
 * the rows and renders.
 *
 * Interaction modes (IA §6): `navigate` (deliberate full-context acts — approvals,
 * mentions, briefs, review-requested), `review_modal` (prose judgement — section/
 * snippet reviews), `act_here` (override confirm/update/remove). v1 renders every
 * card with an Open/Review link to its owning surface plus a resolve control; the
 * inline override editor and the full git-diff review modal are follow-ups (they
 * depend on G6.4's per-type review-item generation).
 */

export const ACTION_ITEM_TYPES = [
  'document_approval',
  'review_requested',
  'section_review',
  'override_review',
  'snippet_review',
  'comment_mention',
  'placeholder_brief',
] as const;

export type ActionItemType = (typeof ACTION_ITEM_TYPES)[number];

export type ActionItemMode = 'act_here' | 'review_modal' | 'navigate';

export interface ActionItemTypeMeta {
  /** Card label, e.g. "Section review". */
  label: string;
  /** Collapsible group header, e.g. "Section reviews". */
  groupTitle: string;
  mode: ActionItemMode;
  /** Group urgency order in the queue (lower = nearer the top). */
  order: number;
}

/** Approvals first, then review-requested, then the spec-change review work. */
export const ACTION_ITEM_META: Record<ActionItemType, ActionItemTypeMeta> = {
  document_approval: {
    label: 'Document approval',
    groupTitle: 'Awaiting your approval',
    mode: 'navigate',
    order: 0,
  },
  review_requested: {
    label: 'Review requested',
    groupTitle: 'Review requested',
    mode: 'navigate',
    order: 1,
  },
  section_review: {
    label: 'Section review',
    groupTitle: 'Section reviews',
    mode: 'review_modal',
    order: 2,
  },
  override_review: {
    label: 'Override review',
    groupTitle: 'Overrides',
    mode: 'act_here',
    order: 3,
  },
  snippet_review: {
    label: 'Snippet review',
    groupTitle: 'Snippet reviews',
    mode: 'review_modal',
    order: 4,
  },
  comment_mention: { label: 'Mention', groupTitle: 'Mentions', mode: 'navigate', order: 5 },
  placeholder_brief: { label: 'Brief needed', groupTitle: 'Briefs', mode: 'navigate', order: 6 },
};

export interface DashboardActionItem {
  id: string;
  type: ActionItemType;
  title: string;
  context: string | null;
  documentId: string | null;
  referenceId: string;
  status: 'pending' | 'resolved';
  createdAt: string;
}

export interface ActionItemGroup {
  type: ActionItemType;
  title: string;
  items: DashboardActionItem[];
}

/**
 * Group items by type — groups ordered by urgency, newest-first within each
 * (IA §13.1). Defensive: re-sorts within a group rather than trusting input order.
 */
export function groupActionItems(items: readonly DashboardActionItem[]): ActionItemGroup[] {
  const byType = new Map<ActionItemType, DashboardActionItem[]>();
  for (const item of items) {
    const arr = byType.get(item.type) ?? [];
    arr.push(item);
    byType.set(item.type, arr);
  }
  return [...byType.entries()]
    .map(([type, group]) => ({
      type,
      title: ACTION_ITEM_META[type].groupTitle,
      items: [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    .sort((a, b) => ACTION_ITEM_META[a.type].order - ACTION_ITEM_META[b.type].order);
}

export interface ActionItemStats {
  total: number;
  approvals: number;
  /** Section + snippet reviews — the prose-judgement work. */
  reviews: number;
  overrides: number;
}

/** The stat-tile counts (IA §5 "Stat tiles"). */
export function summarizeActionItems(items: readonly DashboardActionItem[]): ActionItemStats {
  let approvals = 0;
  let reviews = 0;
  let overrides = 0;
  for (const i of items) {
    if (i.type === 'document_approval') approvals += 1;
    else if (i.type === 'section_review' || i.type === 'snippet_review') reviews += 1;
    else if (i.type === 'override_review') overrides += 1;
  }
  return { total: items.length, approvals, reviews, overrides };
}

/**
 * Where a card's primary action goes. Doc-scoped items open the document (its
 * staleness/review/publish surfaces all live there); everything else (an override
 * or a brief prompt) goes to Specs. Always a real in-app route.
 */
export function actionItemHref(item: Pick<DashboardActionItem, 'documentId'>): string {
  return item.documentId ? `/documents/${item.documentId}` : '/specs';
}

/** The verb on the card's primary action, by type. */
export function actionItemCtaLabel(type: ActionItemType): string {
  switch (type) {
    case 'document_approval':
      return 'Open to publish';
    case 'comment_mention':
      return 'Open thread';
    case 'placeholder_brief':
      return 'Add brief';
    case 'section_review':
    case 'snippet_review':
      return 'Review';
    case 'override_review':
      return 'Resolve';
    case 'review_requested':
      return 'Open';
  }
}
