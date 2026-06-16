import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BlockContent, RichTextContent, TextMark } from '@arther/types';
import { BlockRenderer } from './BlockRenderer';

type RNode = RichTextContent['nodes'][number];
const text = (t: string, marks: TextMark[] = []): RNode => ({ type: 'text', text: t, marks });
const token = (display: string): RNode => ({
  type: 'spec_token',
  field_id: 'F1',
  field_version_id: 'V1',
  display_value: display,
  unit_id: 'U1',
  product_id: 'P1',
  component_id: null,
});
const rich = (...nodes: RNode[]): RichTextContent => ({ alignment: 'left', nodes });
const html = (...blocks: BlockContent[]) => renderToStaticMarkup(<BlockRenderer blocks={blocks} />);

describe('BlockRenderer', () => {
  it('renders a paragraph with text and the resolved inline spec token value', () => {
    const out = html({ type: 'paragraph', content: rich(text('Rated at '), token('36 V')) });
    expect(out).toContain('Rated at');
    expect(out).toContain('36 V');
    expect(out).toContain('br-spec-token');
  });

  it('renders headings and nests marks as semantic tags', () => {
    const out = html(
      { type: 'heading', level: 2, content: rich(text('Specifications')) },
      { type: 'paragraph', content: rich(text('bold', [{ type: 'bold' }])) },
    );
    expect(out).toContain('<h2');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('renders a callout with its variant and title', () => {
    const out = html({ type: 'callout', variant: 'tip', title: 'Heads up', content: rich(text('note')) });
    expect(out).toContain('br-callout--tip');
    expect(out).toContain('Heads up');
  });

  it('renders a safety block and its children', () => {
    const out = html({
      type: 'warning',
      title: 'Danger',
      children: [{ type: 'paragraph', content: rich(text('Do not exceed the rating')) }],
    });
    expect(out).toContain('br-safety--warning');
    expect(out).toContain('Do not exceed the rating');
  });

  it('renders a spec_table as a labelled placeholder with its row count', () => {
    const out = html({
      type: 'spec_table',
      product_id: 'P1',
      column_config: {
        show_min: false,
        show_typical: true,
        show_max: false,
        show_conditions: false,
        show_source: false,
        unit_preference: 'metric',
      },
      rows: [{ field_id: 'F1', component_id: 'C1', display_order: 0, visible: true }],
    });
    expect(out).toContain('Specification table — 1 row');
  });

  it('renders a spec_table as a live table when field values are resolved', () => {
    const block: BlockContent = {
      type: 'spec_table',
      product_id: 'P1',
      title: 'Electrical',
      column_config: {
        show_min: true,
        show_typical: true,
        show_max: true,
        show_conditions: false,
        show_source: true,
        unit_preference: 'metric',
      },
      rows: [
        { field_id: 'F1', component_id: 'C1', display_order: 1, visible: true },
        { field_id: 'F2', component_id: 'C1', display_order: 0, visible: true },
        { field_id: 'F3', component_id: 'C1', display_order: 2, visible: false },
      ],
    };
    const resolved = {
      F1: { name: 'Rated voltage', type: 'scalar', value: { value: 48, unit_id: 'u' }, unitSymbol: 'V', ownerName: 'Power board' },
      F2: { name: 'Operating range', type: 'range', value: { min: 10, max: 36, unit_id: 'u' }, unitSymbol: 'V', ownerName: null },
      F3: { name: 'Hidden', type: 'scalar', value: { value: 1, unit_id: 'u' }, unitSymbol: 'A', ownerName: null },
    };
    const out = renderToStaticMarkup(<BlockRenderer blocks={[block]} resolved={resolved as never} />);
    expect(out).toContain('<table');
    expect(out).not.toContain('Specification table —'); // not the placeholder
    expect(out).toContain('Rated voltage');
    expect(out).toContain('48 V'); // scalar → typical
    expect(out).toContain('10 V'); // range → min
    expect(out).toContain('36 V'); // range → max
    expect(out).toContain('Power board'); // source = owner name
    expect(out).not.toContain('Hidden'); // visible:false row omitted
  });

  it('renders an accordion section as details with its child', () => {
    const out = html({
      type: 'accordion',
      sections: [
        {
          id: 's1',
          title: 'Setup',
          display_order: 0,
          default_open: true,
          children: [{ type: 'paragraph', content: rich(text('Mount the drive')) }],
        },
      ],
    });
    expect(out).toContain('<details');
    expect(out).toContain('Setup');
    expect(out).toContain('Mount the drive');
  });
});
