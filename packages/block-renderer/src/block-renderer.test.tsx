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

  const chartBlock: BlockContent = {
    type: 'chart',
    table_field_id: 'TF1',
    product_id: 'P1',
    title: 'Torque curve',
    chart_type: 'line',
    show_legend: true,
    show_grid: true,
  };

  it('renders a chart as an SVG plot when its table field is resolved', () => {
    const resolved = {
      TF1: {
        name: 'Torque vs speed',
        type: 'table',
        value: {
          columns: [
            { id: 'x', name: 'Speed', unit_id: 'u', role: 'independent' },
            { id: 'y', name: 'Torque', unit_id: 'u', role: 'dependent' },
          ],
          rows: [
            { id: 'r1', values: { x: 0, y: 10 } },
            { id: 'r2', values: { x: 100, y: 8 } },
          ],
          interpolation: 'linear',
        },
        unitSymbol: null,
        ownerName: null,
      },
    };
    const out = renderToStaticMarkup(<BlockRenderer blocks={[chartBlock]} resolved={resolved as never} />);
    expect(out).toContain('<svg');
    expect(out).toContain('Torque'); // the dependent column name from SpecChart
    expect(out).toContain('Torque curve'); // the block title
    expect(out).not.toContain('br-placeholder');
  });

  it('keeps the chart placeholder when no resolution is supplied', () => {
    const out = html(chartBlock);
    expect(out).toContain('br-placeholder');
    expect(out).toContain('Torque curve');
    expect(out).not.toContain('<svg');
  });

  const lineResolved = {
    TF1: {
      name: 'Torque vs speed',
      type: 'table',
      value: {
        columns: [
          { id: 'x', name: 'Speed', unit_id: 'u', role: 'independent' },
          { id: 'y', name: 'Torque', unit_id: 'u', role: 'dependent' },
        ],
        rows: [
          { id: 'r1', values: { x: 0, y: 10 } },
          { id: 'r2', values: { x: 100, y: 8 } },
        ],
        interpolation: 'linear',
      },
      unitSymbol: null,
      ownerName: null,
    },
  };

  it('renders a bar chart as rects (not a line path) when chart_type is bar', () => {
    const block: BlockContent = {
      type: 'chart',
      table_field_id: 'TF1',
      product_id: 'P1',
      chart_type: 'bar',
      show_legend: false,
      show_grid: false,
    };
    const out = renderToStaticMarkup(<BlockRenderer blocks={[block]} resolved={lineResolved as never} />);
    expect(out).toContain('<rect');
    expect(out).not.toContain('<path'); // bars, no connecting line
  });

  it('draws gridlines and honours an axis-label override', () => {
    const block: BlockContent = {
      type: 'chart',
      table_field_id: 'TF1',
      product_id: 'P1',
      chart_type: 'line',
      x_axis_label: 'RPM',
      show_legend: false,
      show_grid: true,
    };
    const out = renderToStaticMarkup(<BlockRenderer blocks={[block]} resolved={lineResolved as never} />);
    expect(out).toContain('ui-chart__grid');
    expect(out).toContain('RPM'); // x-axis label override
  });

  it('renders a legend when show_legend is set and a series column exists', () => {
    const seriesResolved = {
      TF1: {
        name: 'Torque',
        type: 'table',
        value: {
          columns: [
            { id: 'x', name: 'Speed', unit_id: 'u', role: 'independent' },
            { id: 'y', name: 'Torque', unit_id: 'u', role: 'dependent' },
            { id: 's', name: 'Temp', unit_id: 'u', role: 'series' },
          ],
          rows: [
            { id: 'r1', values: { x: 0, y: 10, s: 25 } },
            { id: 'r2', values: { x: 100, y: 8, s: 25 } },
            { id: 'r3', values: { x: 0, y: 7, s: 85 } },
            { id: 'r4', values: { x: 100, y: 5, s: 85 } },
          ],
          interpolation: 'linear',
        },
        unitSymbol: null,
        ownerName: null,
      },
    };
    const block: BlockContent = {
      type: 'chart',
      table_field_id: 'TF1',
      product_id: 'P1',
      chart_type: 'line',
      show_legend: true,
      show_grid: false,
    };
    const out = renderToStaticMarkup(<BlockRenderer blocks={[block]} resolved={seriesResolved as never} />);
    expect(out).toContain('ui-chart__legend');
  });

  it('renders a toc from the document headings with anchor links', () => {
    const out = html(
      { type: 'section_header', title: 'Overview' }, // index 0
      { type: 'heading', level: 2, content: rich(text('Wiring')) }, // index 1
      { type: 'toc', title: 'Contents', depth: 2 }, // index 2
      { type: 'section_header', title: 'Safety' }, // index 3
    );
    expect(out).toContain('br-toc');
    expect(out).toContain('Contents');
    expect(out).toContain('href="#br-block-0"'); // Overview
    expect(out).toContain('href="#br-block-1"'); // Wiring (H2, within depth 2)
    expect(out).toContain('href="#br-block-3"'); // Safety
    expect(out).toContain('id="br-block-0"'); // the heading carries the matching anchor
  });

  it('respects toc depth — depth 1 links only section headers', () => {
    const out = html(
      { type: 'section_header', title: 'Overview' }, // index 0
      { type: 'heading', level: 2, content: rich(text('Wiring')) }, // index 1
      { type: 'toc', depth: 1 }, // index 2
    );
    expect(out).toContain('href="#br-block-0"'); // section header linked
    expect(out).not.toContain('href="#br-block-1"'); // H2 excluded at depth 1
  });

  it('renders a video with controls and a caption', () => {
    const out = html({
      type: 'video',
      url: 'https://example.com/v.mp4',
      autoplay: false,
      caption: rich(text('Demo')),
    });
    expect(out).toContain('<video');
    expect(out).toContain('https://example.com/v.mp4');
    expect(out).toContain('Demo');
  });

  it('renders a gif as an image', () => {
    const out = html({ type: 'gif', url: 'https://example.com/a.gif', storage_key: 'k', alt_text: 'spin' });
    expect(out).toContain('<img');
    expect(out).toContain('https://example.com/a.gif');
    expect(out).toContain('spin');
  });

  it('renders a hotspot image with positioned pins and a legend', () => {
    const out = html({
      type: 'hotspot_image',
      url: 'https://example.com/i.png',
      storage_key: 'k',
      alt_text: 'panel',
      pins: [{ id: 'p1', number: 1, x_percent: 20, y_percent: 30, label: 'Power switch' }],
    });
    expect(out).toContain('br-hotspot');
    expect(out).toContain('Power switch');
    expect(out).toContain('20%'); // pin x position
  });

  it('keeps a snippet as a labelled placeholder (Content Reuse is Phase 4)', () => {
    const out = html({ type: 'snippet', snippet_id: 's1', snippet_name: 'Boilerplate warranty' });
    expect(out).toContain('br-placeholder');
    expect(out).toContain('Boilerplate warranty');
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

describe('BlockRenderer print degradation (C5.2)', () => {
  const printHtml = (...blocks: BlockContent[]) =>
    renderToStaticMarkup(<BlockRenderer blocks={blocks} mode="print" />);

  it('degrades a video to its poster frame + source URL (no <video> on paper)', () => {
    const block: BlockContent = {
      type: 'video',
      url: 'https://cdn.example.com/clip.mp4',
      thumbnail_url: 'https://cdn.example.com/poster.jpg',
      caption: rich(text('Assembly walkthrough')),
      autoplay: false,
    };
    const out = printHtml(block);
    expect(out).not.toContain('<video');
    expect(out).toContain('poster.jpg');
    expect(out).toContain('Video: https://cdn.example.com/clip.mp4');
    expect(out).toContain('Assembly walkthrough');
  });

  it('still renders an interactive <video controls> in web mode', () => {
    const block: BlockContent = {
      type: 'video',
      url: 'https://cdn.example.com/clip.mp4',
      thumbnail_url: 'https://cdn.example.com/poster.jpg',
      autoplay: false,
    };
    expect(renderToStaticMarkup(<BlockRenderer blocks={[block]} />)).toContain('<video');
  });

  it('expands every accordion section in print so nothing is hidden', () => {
    const block: BlockContent = {
      type: 'accordion',
      sections: [
        {
          id: 's1',
          title: 'Collapsed by default',
          display_order: 0,
          default_open: false,
          children: [{ type: 'paragraph', content: rich(text('Hidden on the web')) }],
        },
      ],
    };
    const out = printHtml(block);
    expect(out).toContain('<details open');
    expect(out).toContain('Hidden on the web');
    // Web mode keeps it collapsed.
    expect(renderToStaticMarkup(<BlockRenderer blocks={[block]} />)).not.toContain('<details open');
  });

  it('tags the print document root for the @media print stylesheet', () => {
    expect(printHtml({ type: 'divider' })).toContain('br-doc--print');
  });
});
