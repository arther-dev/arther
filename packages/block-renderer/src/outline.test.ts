import { describe, expect, it } from 'vitest';
import type { BlockContent, RichTextContent } from '@arther/types';
import { buildOutline } from './outline';

const rich = (text: string): RichTextContent => ({
  alignment: 'left',
  nodes: [{ type: 'text', text, marks: [] }],
});
const block = (id: string, content: BlockContent) => ({ id, content });

describe('buildOutline', () => {
  it('extracts section headers and headings in order, with levels', () => {
    const outline = buildOutline([
      block('b1', { type: 'section_header', title: 'Overview' }),
      block('b2', { type: 'paragraph', content: rich('body') }),
      block('b3', { type: 'heading', level: 2, content: rich('Electrical') }),
      block('b4', { type: 'heading', level: 3, content: rich('Voltage') }),
    ]);
    expect(outline).toEqual([
      { id: 'b1', label: 'Overview', level: 0 },
      { id: 'b3', label: 'Electrical', level: 1 },
      { id: 'b4', label: 'Voltage', level: 2 },
    ]);
  });

  it('falls back to a label for an empty section header', () => {
    expect(buildOutline([block('b1', { type: 'section_header', title: '' })])).toEqual([
      { id: 'b1', label: 'Section', level: 0 },
    ]);
  });

  it('ignores non-structural blocks', () => {
    expect(buildOutline([block('b1', { type: 'divider' })])).toEqual([]);
  });
});
