import type { RichTextContent, TextMark } from '@arther/types';

/**
 * G4.3 — the RichTextContent ⇄ ProseMirror document mapping (ADR-013). The
 * editor (TipTap) speaks ProseMirror JSON; the persisted/rendered model is
 * `RichTextContent` (one source, ADR-012). This pure conversion is the seam:
 * a block's inline content becomes a single `paragraph` node (alignment as an
 * attr), text marks map to PM marks, and **inline spec tokens become an atom
 * node** (`specToken`) — non-editable by construction, carrying the resolved
 * value attrs so the editor never lets a value be hand-edited (invariant: values
 * are grounded, not typed).
 *
 * Pure → exhaustively unit-testable without TipTap or a browser.
 */
export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  text?: string;
  marks?: PMMark[];
  attrs?: Record<string, unknown>;
  content?: PMNode[];
}
export interface PMDoc {
  type: 'doc';
  content: PMNode[];
}

const OUR_TO_PM: Partial<Record<TextMark['type'], string>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strike',
  superscript: 'superscript',
  subscript: 'subscript',
  inline_code: 'code',
};
const PM_TO_OUR: Record<string, TextMark['type']> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',
  superscript: 'superscript',
  subscript: 'subscript',
  code: 'inline_code',
};

function marksToPM(marks: TextMark[]): PMMark[] {
  const out: PMMark[] = [];
  for (const mark of marks) {
    if (mark.type === 'text_color') out.push({ type: 'textStyle', attrs: { color: mark.color ?? null } });
    else if (mark.type === 'highlight') out.push({ type: 'highlight', attrs: { color: mark.color ?? null } });
    else {
      const pm = OUR_TO_PM[mark.type];
      if (pm) out.push({ type: pm });
    }
  }
  return out;
}

function marksFromPM(marks: PMMark[] | undefined): TextMark[] {
  const out: TextMark[] = [];
  for (const mark of marks ?? []) {
    if (mark.type === 'textStyle') {
      const color = mark.attrs?.color;
      if (typeof color === 'string') out.push({ type: 'text_color', color });
    } else if (mark.type === 'highlight') {
      const color = mark.attrs?.color;
      out.push(typeof color === 'string' ? { type: 'highlight', color } : { type: 'highlight' });
    } else {
      const ours = PM_TO_OUR[mark.type];
      if (ours) out.push({ type: ours });
    }
  }
  return out;
}

function tokenAttrs(node: { field_id: string; field_version_id: string; display_value: string; unit_id: string | null; product_id: string; component_id: string | null }) {
  return {
    field_id: node.field_id,
    field_version_id: node.field_version_id,
    display_value: node.display_value,
    unit_id: node.unit_id,
    product_id: node.product_id,
    component_id: node.component_id,
  };
}

/** A block's rich text → a one-paragraph ProseMirror doc the editor loads. */
export function richTextToDoc(content: RichTextContent): PMDoc {
  const inline: PMNode[] = [];
  for (const node of content.nodes) {
    if (node.type === 'text') {
      if (node.text.length === 0) continue;
      inline.push({ type: 'text', text: node.text, marks: marksToPM(node.marks) });
    } else if (node.type === 'spec_token') {
      inline.push({ type: 'specToken', attrs: tokenAttrs(node) });
    } else {
      // Link node: flatten children, tagging text with a link mark (the editor
      // doesn't author links in v1; this keeps any existing ones loadable).
      for (const child of node.nodes) {
        if (child.type === 'text') {
          inline.push({
            type: 'text',
            text: child.text,
            marks: [...marksToPM(child.marks), { type: 'link', attrs: { href: node.href } }],
          });
        } else {
          inline.push({ type: 'specToken', attrs: tokenAttrs(child) });
        }
      }
    }
  }
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { alignment: content.alignment }, content: inline }] };
}

/** The editor's ProseMirror doc → RichTextContent to persist (one paragraph). */
export function docToRichText(doc: PMDoc): RichTextContent {
  const paragraph = doc.content.find((n) => n.type === 'paragraph') ?? doc.content[0];
  const rawAlign = paragraph?.attrs?.alignment;
  const alignment: RichTextContent['alignment'] =
    rawAlign === 'center' || rawAlign === 'right' || rawAlign === 'justify' ? rawAlign : 'left';

  const nodes: RichTextContent['nodes'] = [];
  for (const node of paragraph?.content ?? []) {
    if (node.type === 'text' && node.text) {
      nodes.push({ type: 'text', text: node.text, marks: marksFromPM(node.marks) });
    } else if (node.type === 'specToken' && node.attrs) {
      const a = node.attrs;
      nodes.push({
        type: 'spec_token',
        field_id: String(a.field_id ?? ''),
        field_version_id: String(a.field_version_id ?? ''),
        display_value: String(a.display_value ?? ''),
        unit_id: typeof a.unit_id === 'string' ? a.unit_id : null,
        product_id: String(a.product_id ?? ''),
        component_id: typeof a.component_id === 'string' ? a.component_id : null,
      });
    }
  }
  return { alignment, nodes };
}
