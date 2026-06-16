import { describe, expect, it } from 'vitest';
import type { BlockContent, RichTextContent } from './block-content';
import {
  attributeSections,
  classifyBlockSpeed,
  coalesceReviewSections,
  planFieldPropagation,
  rewriteSpecTokens,
  type PropagationBlock,
  type SpecTokenReplacement,
} from './propagation';

const FIELD = 'field-1';
const OTHER = 'field-2';
const REPL: SpecTokenReplacement = { fieldVersionId: 'v2', displayValue: '48 V' };

function token(fieldId: string, version = 'v1', display = '36 V') {
  return {
    type: 'spec_token' as const,
    field_id: fieldId,
    field_version_id: version,
    display_value: display,
    unit_id: null,
    product_id: 'p1',
    component_id: null,
  };
}

function rt(...nodes: RichTextContent['nodes']): RichTextContent {
  return { alignment: 'left', nodes };
}

const paragraph = (content: RichTextContent) => ({ type: 'paragraph' as const, content });

describe('classifyBlockSpeed', () => {
  it('prose blocks carry sentences a value change can invalidate', () => {
    for (const t of ['paragraph', 'heading', 'callout', 'warning', 'caution', 'note', 'accordion', 'step_wizard'] as const) {
      expect(classifyBlockSpeed(t)).toBe('prose');
    }
  });
  it('structured blocks auto-update without review', () => {
    for (const t of ['spec_table', 'chart', 'image', 'snippet'] as const) {
      expect(classifyBlockSpeed(t)).toBe('structured');
    }
  });
  it('structural blocks never cite a field', () => {
    expect(classifyBlockSpeed('section_header')).toBe('structural');
    expect(classifyBlockSpeed('divider')).toBe('structural');
  });
});

describe('rewriteSpecTokens', () => {
  it('advances a matching token in a paragraph and leaves text alone', () => {
    const before = paragraph(rt({ type: 'text', text: 'Rated at ', marks: [] }, token(FIELD)));
    const { content, count } = rewriteSpecTokens(before, FIELD, REPL);
    expect(count).toBe(1);
    const node = (content as { content: RichTextContent }).content.nodes[1];
    expect(node).toMatchObject({ field_version_id: 'v2', display_value: '48 V' });
    // The original is untouched (pure).
    expect((before.content.nodes[1] as { field_version_id: string }).field_version_id).toBe('v1');
  });

  it('ignores tokens for a different field (count 0, same reference back)', () => {
    const before = paragraph(rt(token(OTHER)));
    const { content, count } = rewriteSpecTokens(before, FIELD, REPL);
    expect(count).toBe(0);
    expect(content).toBe(before);
  });

  it('rewrites tokens nested inside a link', () => {
    const before = paragraph(
      rt({ type: 'link', href: 'https://x', nodes: [token(FIELD)] }),
    );
    const { count } = rewriteSpecTokens(before, FIELD, REPL);
    expect(count).toBe(1);
  });

  it('recurses into safety-block children', () => {
    const warning: BlockContent = {
      type: 'warning',
      children: [paragraph(rt(token(FIELD))) as never],
    };
    const { count } = rewriteSpecTokens(warning, FIELD, REPL);
    expect(count).toBe(1);
  });

  it('recurses into accordion section children', () => {
    const accordion: BlockContent = {
      type: 'accordion',
      sections: [
        { id: 's1', title: 'A', display_order: 0, default_open: true, children: [paragraph(rt(token(FIELD), token(FIELD))) as never] },
      ],
    };
    const { count } = rewriteSpecTokens(accordion, FIELD, REPL);
    expect(count).toBe(2);
  });

  it('is a no-op for structured blocks with no inline tokens', () => {
    const table: BlockContent = {
      type: 'spec_table',
      product_id: 'p1',
      column_config: { show_min: true, show_typical: true, show_max: true, show_conditions: false, show_source: false, unit_preference: 'metric' },
      rows: [{ field_id: FIELD, component_id: 'c1', display_order: 0, visible: true }],
    };
    const { content, count } = rewriteSpecTokens(table, FIELD, REPL);
    expect(count).toBe(0);
    expect(content).toBe(table);
  });
});

describe('attributeSections', () => {
  it('attributes blocks to the nearest preceding section header', () => {
    const blocks = [
      { id: 'b0', content: paragraph(rt()) },
      { id: 'b1', content: { type: 'section_header', title: 'Electrical' } as BlockContent },
      { id: 'b2', content: paragraph(rt()) },
      { id: 'b3', content: { type: 'section_header', title: 'Mechanical' } as BlockContent },
      { id: 'b4', content: paragraph(rt()) },
    ];
    const map = attributeSections(blocks);
    expect(map.get('b0')).toBe('Document'); // before any header → default
    expect(map.get('b2')).toBe('Electrical');
    expect(map.get('b4')).toBe('Mechanical');
  });
});

describe('planFieldPropagation', () => {
  const blocks: PropagationBlock[] = [
    { id: 'h', type: 'section_header', content: { type: 'section_header', title: 'Electrical' } },
    { id: 'p1', type: 'paragraph', content: paragraph(rt({ type: 'text', text: 'Rated ', marks: [] }, token(FIELD))) },
    { id: 'tbl', type: 'spec_table', content: { type: 'spec_table', product_id: 'p1', column_config: { show_min: true, show_typical: true, show_max: true, show_conditions: false, show_source: false, unit_preference: 'metric' }, rows: [{ field_id: FIELD, component_id: 'c1', display_order: 0, visible: true }] } },
  ];
  const staleBlockIds = new Set(['p1', 'tbl']);

  it('rewrites the prose token but emits NO review item for a draft', () => {
    const plan = planFieldPropagation({
      blocks, staleBlockIds, fieldId: FIELD, category: 'Electrical', replacement: REPL,
      published: false, ownerForCategory: 'owner-1',
    });
    expect(plan.blockUpdates.map((u) => u.blockId)).toEqual(['p1']); // table has no inline token
    expect(plan.reviewSections).toEqual([]);
  });

  it('flags the prose section (routed to the owner) for a published document', () => {
    const plan = planFieldPropagation({
      blocks, staleBlockIds, fieldId: FIELD, category: 'Electrical', replacement: REPL,
      published: true, ownerForCategory: 'owner-1',
    });
    expect(plan.blockUpdates.map((u) => u.blockId)).toEqual(['p1']);
    expect(plan.reviewSections).toEqual([
      { sectionName: 'Electrical', category: 'Electrical', ownerUserId: 'owner-1', blockIds: ['p1'] },
    ]);
  });

  it('recomputes text_content from the rewritten content', () => {
    const plan = planFieldPropagation({
      blocks, staleBlockIds, fieldId: FIELD, category: 'Electrical', replacement: REPL,
      published: false, ownerForCategory: null,
    });
    expect(plan.blockUpdates[0]!.textContent).toContain('48 V');
  });

  it('skips blocks not in the stale set', () => {
    const plan = planFieldPropagation({
      blocks, staleBlockIds: new Set(['tbl']), fieldId: FIELD, category: 'Electrical', replacement: REPL,
      published: true, ownerForCategory: 'owner-1',
    });
    expect(plan.blockUpdates).toEqual([]); // p1 not stale; tbl has no token
    expect(plan.reviewSections).toEqual([]);
  });
});

describe('coalesceReviewSections (G6.2b batch)', () => {
  it('merges two fields hitting the same section + owner into one item', () => {
    const out = coalesceReviewSections([
      { diffId: 'd1', sections: [{ sectionName: 'Electrical', category: 'Electrical', ownerUserId: 'u1', blockIds: ['b1', 'b2'] }] },
      { diffId: 'd2', sections: [{ sectionName: 'Electrical', category: 'Electrical', ownerUserId: 'u1', blockIds: ['b2', 'b3'] }] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.diffIds).toEqual(['d1', 'd2']);
    expect(out[0]!.blockIds).toEqual(['b1', 'b2', 'b3']); // union, de-duped, first-seen order
    expect(out[0]!.category).toBe('Electrical');
    expect(out[0]!.ownerUserId).toBe('u1');
  });

  it('keeps separate items per section and per assignee', () => {
    const out = coalesceReviewSections([
      { diffId: 'd1', sections: [{ sectionName: 'A', category: 'X', ownerUserId: 'u1', blockIds: ['b1'] }] },
      { diffId: 'd2', sections: [{ sectionName: 'A', category: 'X', ownerUserId: 'u2', blockIds: ['b2'] }] },
      { diffId: 'd3', sections: [{ sectionName: 'B', category: 'X', ownerUserId: 'u1', blockIds: ['b3'] }] },
    ]);
    expect(out).toHaveLength(3);
  });

  it('nulls the category when coalesced fields span more than one', () => {
    const out = coalesceReviewSections([
      { diffId: 'd1', sections: [{ sectionName: 'Overview', category: 'Electrical', ownerUserId: 'u1', blockIds: ['b1'] }] },
      { diffId: 'd2', sections: [{ sectionName: 'Overview', category: 'Mechanical', ownerUserId: 'u1', blockIds: ['b1'] }] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.category).toBeNull();
    expect(out[0]!.blockIds).toEqual(['b1']); // same block, de-duped
  });

  it('coalesces unassigned (null owner) sections together', () => {
    const out = coalesceReviewSections([
      { diffId: 'd1', sections: [{ sectionName: 'S', category: 'X', ownerUserId: null, blockIds: ['b1'] }] },
      { diffId: 'd2', sections: [{ sectionName: 'S', category: 'X', ownerUserId: null, blockIds: ['b2'] }] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.ownerUserId).toBeNull();
    expect(out[0]!.diffIds).toEqual(['d1', 'd2']);
  });

  it('is empty for no contributions', () => {
    expect(coalesceReviewSections([])).toEqual([]);
  });
});
