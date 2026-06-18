import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from './document-types';
import {
  aiSpecTokenNodeSchema,
  blockContentSchema,
  blockSpecFieldIds,
  canContain,
  CONTAINER_BLOCK_TYPES,
  generatedSectionSchema,
  generationToolJsonSchema,
  inlineSpecTokenNodeSchema,
  isContainerBlockType,
  PERMITTED_CHILD_BLOCK_TYPES,
  richTextContentSchema,
  textMarkSchema,
  INSERTABLE_BLOCK_TYPES,
  defaultBlockContent,
  insertableBlockLabel,
} from './block-content';

describe('rich text', () => {
  it('accepts text, link, and resolved spec-token nodes', () => {
    const result = richTextContentSchema.safeParse({
      alignment: 'left',
      nodes: [
        { type: 'text', text: 'Rated at ', marks: [{ type: 'bold' }] },
        {
          type: 'spec_token',
          field_id: 'f1',
          field_version_id: 'v1',
          display_value: '36 V',
          unit_id: 'u1',
          product_id: 'p1',
          component_id: 'c1',
        },
        { type: 'link', href: 'https://x', nodes: [{ type: 'text', text: 'docs', marks: [] }] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('allows color only on color-bearing marks', () => {
    expect(textMarkSchema.safeParse({ type: 'highlight', color: '#ff0' }).success).toBe(true);
    expect(textMarkSchema.safeParse({ type: 'text_color', color: '#ff00aa' }).success).toBe(true);
    expect(textMarkSchema.safeParse({ type: 'bold', color: '#fff' }).success).toBe(false);
    expect(textMarkSchema.safeParse({ type: 'highlight', color: 'red' }).success).toBe(false);
  });

  it('rejects unknown node types (strict union)', () => {
    const result = richTextContentSchema.safeParse({
      alignment: 'left',
      nodes: [{ type: 'emoji', value: '🙂' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('block content union', () => {
  it('covers every BLOCK_TYPE exactly once', () => {
    const discriminators = blockContentSchema.options.map(
      // each option is a strictObject whose `type` is a literal
      (option) => (option as { shape: { type: { value: string } } }).shape.type.value,
    );
    expect(new Set(discriminators)).toEqual(new Set(BLOCK_TYPES));
    expect(discriminators).toHaveLength(BLOCK_TYPES.length);
  });

  it('parses a heading and a spec table', () => {
    expect(
      blockContentSchema.safeParse({
        type: 'heading',
        level: 2,
        content: { alignment: 'left', nodes: [] },
      }).success,
    ).toBe(true);
    expect(
      blockContentSchema.safeParse({
        type: 'spec_table',
        product_id: 'p1',
        column_config: {
          show_min: true,
          show_typical: true,
          show_max: true,
          show_conditions: false,
          show_source: false,
          unit_preference: 'metric',
        },
        rows: [{ field_id: 'f1', component_id: 'c1', display_order: 0, visible: true }],
      }).success,
    ).toBe(true);
  });

  it('rejects an H1 heading (only H2/H3 are blocks)', () => {
    expect(
      blockContentSchema.safeParse({
        type: 'heading',
        level: 1,
        content: { alignment: 'left', nodes: [] },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields on a divider (strict)', () => {
    expect(blockContentSchema.safeParse({ type: 'divider', title: 'x' }).success).toBe(false);
  });
});

describe('container nesting (spec §4.11)', () => {
  it('accepts a safety block holding paragraph/heading/image children', () => {
    const result = blockContentSchema.safeParse({
      type: 'warning',
      children: [
        { type: 'paragraph', content: { alignment: 'left', nodes: [] } },
        { type: 'image', url: 'u', storage_key: 'k', alt_text: 'a', width: 'full' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an accordion section holding a nested safety block', () => {
    const result = blockContentSchema.safeParse({
      type: 'accordion',
      sections: [
        {
          id: 's1',
          title: 'Setup',
          display_order: 0,
          default_open: true,
          children: [
            { type: 'note', children: [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }] },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an accordion nested inside an accordion section', () => {
    const result = blockContentSchema.safeParse({
      type: 'accordion',
      sections: [
        {
          id: 's1',
          title: 'Setup',
          display_order: 0,
          default_open: true,
          children: [{ type: 'accordion', sections: [] }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('encodes the §4.11 child rules as data and helpers', () => {
    expect(isContainerBlockType('accordion')).toBe(true);
    expect(isContainerBlockType('paragraph')).toBe(false);
    expect(canContain('accordion', 'spec_table')).toBe(true);
    expect(canContain('warning', 'paragraph')).toBe(true);
    expect(canContain('warning', 'spec_table')).toBe(false);
    expect(canContain('accordion', 'accordion')).toBe(false);
    expect(canContain('paragraph', 'heading')).toBe(false);
    // Every container has a rule entry, and no rule offers a forbidden container.
    for (const container of CONTAINER_BLOCK_TYPES) {
      const children = PERMITTED_CHILD_BLOCK_TYPES[container];
      expect(children.length).toBeGreaterThan(0);
      expect(children).not.toContain('accordion');
      expect(children).not.toContain('step_wizard');
      expect(children).not.toContain('snippet');
    }
  });
});

describe('generation tool-use contract', () => {
  it('accepts a section the model could emit', () => {
    const result = generatedSectionSchema.safeParse({
      section_name: 'Overview',
      blocks: [
        {
          block_type: 'paragraph',
          source: 'spec',
          block: {
            type: 'paragraph',
            content: {
              alignment: 'left',
              nodes: [
                { type: 'text', text: 'Rated at ', marks: [] },
                { type: 'spec_token', field_id: 'f1', product_id: 'p1', component_id: 'c1' },
              ],
            },
          },
        },
        {
          block_type: 'warning',
          source: 'spec',
          block: {
            type: 'warning',
            children: [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("forbids the model minting a field version or display value", () => {
    // The persisted token carries the resolved snapshot…
    expect(
      inlineSpecTokenNodeSchema.safeParse({
        type: 'spec_token',
        field_id: 'f1',
        field_version_id: 'v1',
        display_value: '36 V',
        unit_id: 'u1',
        product_id: 'p1',
        component_id: 'c1',
      }).success,
    ).toBe(true);
    // …but the AI token is strict and rejects those fields outright.
    expect(
      aiSpecTokenNodeSchema.safeParse({
        type: 'spec_token',
        field_id: 'f1',
        product_id: 'p1',
        component_id: 'c1',
        field_version_id: 'v1',
      }).success,
    ).toBe(false);
  });

  it('renders to a JSON schema usable as a tool input_schema', () => {
    const schema = generationToolJsonSchema();
    expect(schema).toMatchObject({ type: 'object' });
    expect(schema.properties).toBeTruthy();
    expect((schema.properties as Record<string, unknown>).blocks).toBeTruthy();
  });
});

describe('manual block insertion (G4.6)', () => {
  it('every insertable default is a valid BlockContent of the requested type', () => {
    for (const type of INSERTABLE_BLOCK_TYPES) {
      const content = defaultBlockContent(type);
      expect(content.type).toBe(type);
      const parsed = blockContentSchema.safeParse(content);
      expect(parsed.success, `${type} default should pass blockContentSchema`).toBe(true);
    }
  });

  it('gives a human label for each insertable type', () => {
    expect(insertableBlockLabel('section_header')).toBe('Section header');
    expect(insertableBlockLabel('paragraph')).toBe('Paragraph');
    for (const type of INSERTABLE_BLOCK_TYPES) {
      expect(insertableBlockLabel(type).length).toBeGreaterThan(0);
    }
  });
})

describe('blockSpecFieldIds (R.9 snippet staleness)', () => {
  const token = (fieldId: string) => ({
    type: 'spec_token' as const,
    field_id: fieldId,
    field_version_id: 'v1',
    display_value: '5 V',
    unit_id: null,
    product_id: 'p1',
    component_id: null,
  });

  it('collects spec_token field ids from prose, including inside a link', () => {
    const block = {
      type: 'paragraph',
      content: {
        alignment: 'left',
        nodes: [
          { type: 'text', text: 'Rated at ', marks: [] },
          token('field-a'),
          { type: 'link', href: 'https://x', nodes: [token('field-b')] },
        ],
      },
    } as unknown as Parameters<typeof blockSpecFieldIds>[0];
    expect(blockSpecFieldIds(block).sort()).toEqual(['field-a', 'field-b']);
  });

  it('collects field ids from a spec_table and a chart', () => {
    const table = {
      type: 'spec_table',
      product_id: 'p1',
      column_config: {
        show_min: false,
        show_typical: true,
        show_max: false,
        show_conditions: false,
        show_source: false,
        unit_preference: 'metric',
      },
      rows: [
        { field_id: 'f1', component_id: 'c1', display_order: 0, visible: true },
        { field_id: 'f2', component_id: 'c1', display_order: 1, visible: true },
      ],
    } as unknown as Parameters<typeof blockSpecFieldIds>[0];
    expect(blockSpecFieldIds(table).sort()).toEqual(['f1', 'f2']);

    const chart = {
      type: 'chart',
      table_field_id: 'f3',
      product_id: 'p1',
      chart_type: 'line',
      show_legend: true,
      show_grid: true,
    } as unknown as Parameters<typeof blockSpecFieldIds>[0];
    expect(blockSpecFieldIds(chart)).toEqual(['f3']);
  });

  it('returns nothing for prose with no spec tokens', () => {
    const block = {
      type: 'paragraph',
      content: { alignment: 'left', nodes: [{ type: 'text', text: 'plain', marks: [] }] },
    } as unknown as Parameters<typeof blockSpecFieldIds>[0];
    expect(blockSpecFieldIds(block)).toEqual([]);
  });
})
