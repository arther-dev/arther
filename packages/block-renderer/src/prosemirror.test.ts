import { describe, expect, it } from 'vitest';
import type { RichTextContent } from '@arther/types';
import { docToRichText, richTextToDoc } from './prosemirror';

const content: RichTextContent = {
  alignment: 'center',
  nodes: [
    { type: 'text', text: 'Rated at ', marks: [{ type: 'bold' }] },
    {
      type: 'spec_token',
      field_id: 'F1',
      field_version_id: 'V1',
      display_value: '36 V',
      unit_id: 'U1',
      product_id: 'P1',
      component_id: null,
    },
    { type: 'text', text: ' nominal', marks: [{ type: 'text_color', color: '#ff0000' }] },
  ],
};

describe('richText ⇄ ProseMirror', () => {
  it('wraps inline content in one paragraph with alignment, mapping marks and tokens', () => {
    const doc = richTextToDoc(content);
    expect(doc.content[0]!.type).toBe('paragraph');
    expect(doc.content[0]!.attrs?.alignment).toBe('center');
    const inline = doc.content[0]!.content!;
    expect(inline[0]).toMatchObject({ type: 'text', text: 'Rated at ', marks: [{ type: 'bold' }] });
    expect(inline[1]).toMatchObject({ type: 'specToken', attrs: { field_id: 'F1', display_value: '36 V' } });
    expect(inline[2]!.marks).toEqual([{ type: 'textStyle', attrs: { color: '#ff0000' } }]);
  });

  it('round-trips a block through the editor model losslessly', () => {
    expect(docToRichText(richTextToDoc(content))).toEqual(content);
  });

  it('maps PM mark names back to ours (strike → strikethrough, code → inline_code)', () => {
    const out = docToRichText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { alignment: 'left' },
          content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }, { type: 'code' }] }],
        },
      ],
    });
    expect(out.nodes[0]).toMatchObject({
      type: 'text',
      marks: [{ type: 'strikethrough' }, { type: 'inline_code' }],
    });
  });

  it('preserves the spec token attrs verbatim (the value is never hand-edited)', () => {
    const doc = richTextToDoc(content);
    const back = docToRichText(doc);
    expect(back.nodes[1]).toEqual(content.nodes[1]);
  });
});
