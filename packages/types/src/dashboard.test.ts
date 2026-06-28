import { describe, expect, it } from 'vitest';
import {
  ACTION_ITEM_META,
  ACTION_ITEM_TYPES,
  actionItemCtaLabel,
  actionItemHref,
  groupActionItems,
  summarizeActionItems,
  type DashboardActionItem,
} from './dashboard';

function item(over: Partial<DashboardActionItem> & { type: DashboardActionItem['type'] }): DashboardActionItem {
  return {
    id: over.id ?? `id-${over.type}`,
    type: over.type,
    title: over.title ?? 'A task',
    context: over.context ?? null,
    documentId: over.documentId ?? null,
    referenceId: over.referenceId ?? 'ref',
    status: over.status ?? 'pending',
    createdAt: over.createdAt ?? '2026-06-01T00:00:00Z',
  };
}

describe('groupActionItems (G6.5)', () => {
  it('orders groups by urgency (approvals first, briefs last)', () => {
    const groups = groupActionItems([
      item({ type: 'placeholder_brief' }),
      item({ type: 'section_review' }),
      item({ type: 'document_approval' }),
      item({ type: 'override_review' }),
    ]);
    expect(groups.map((g) => g.type)).toEqual([
      'document_approval',
      'section_review',
      'override_review',
      'placeholder_brief',
    ]);
  });

  it('orders items newest-first within a group', () => {
    const groups = groupActionItems([
      item({ id: 'old', type: 'section_review', createdAt: '2026-06-01T00:00:00Z' }),
      item({ id: 'new', type: 'section_review', createdAt: '2026-06-09T00:00:00Z' }),
      item({ id: 'mid', type: 'section_review', createdAt: '2026-06-05T00:00:00Z' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('uses the group title from the type metadata', () => {
    const [g] = groupActionItems([item({ type: 'document_approval' })]);
    expect(g!.title).toBe('Awaiting your approval');
  });

  it('returns no groups for an empty queue', () => {
    expect(groupActionItems([])).toEqual([]);
  });
});

describe('summarizeActionItems (G6.5 stat tiles)', () => {
  it('counts approvals, reviews (section + snippet), and overrides', () => {
    const stats = summarizeActionItems([
      item({ type: 'document_approval' }),
      item({ type: 'section_review' }),
      item({ type: 'snippet_review' }),
      item({ type: 'override_review' }),
      item({ type: 'comment_mention' }),
    ]);
    expect(stats).toEqual({ total: 5, approvals: 1, reviews: 2, overrides: 1 });
  });
});

describe('actionItemHref / actionItemCtaLabel (G6.5 routing)', () => {
  it('routes doc-scoped items to the document, others to Specs', () => {
    expect(actionItemHref({ documentId: 'doc-1' })).toBe('/documents/doc-1');
    expect(actionItemHref({ documentId: null })).toBe('/specs');
  });

  it('gives every type a non-empty CTA label', () => {
    for (const type of ACTION_ITEM_TYPES) {
      expect(actionItemCtaLabel(type).length).toBeGreaterThan(0);
    }
  });

  it('covers every type in the metadata map with a unique order', () => {
    const orders = ACTION_ITEM_TYPES.map((t) => ACTION_ITEM_META[t].order);
    expect(new Set(orders).size).toBe(ACTION_ITEM_TYPES.length);
  });
});
