import { createElement, type CSSProperties, type ReactNode } from 'react';
import type { RichTextContent } from '@arther/types';

/**
 * Rich text (spec §4.2) → React. Marks nest as semantic tags; colour/highlight
 * apply inline; an inline spec token renders its resolved `display_value` as a
 * non-editable chip (the value was grounded at generation/commit). Links wrap
 * their inner nodes. One implementation for editor preview, portal SSR, and PDF.
 */
type RichNode = RichTextContent['nodes'][number];

const MARK_TAG: Record<string, 'strong' | 'em' | 'u' | 's' | 'sup' | 'sub' | 'code'> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikethrough: 's',
  superscript: 'sup',
  subscript: 'sub',
  inline_code: 'code',
};

function renderNode(node: RichNode, key: number): ReactNode {
  if (node.type === 'text') {
    let content: ReactNode = node.text;
    for (const mark of node.marks) {
      const tag = MARK_TAG[mark.type];
      if (tag) content = createElement(tag, undefined, content);
    }
    const style: CSSProperties = {};
    for (const mark of node.marks) {
      if (mark.type === 'text_color' && mark.color) style.color = mark.color;
      if (mark.type === 'highlight' && mark.color) style.backgroundColor = mark.color;
    }
    if (style.color || style.backgroundColor) content = <span style={style}>{content}</span>;
    return <span key={key}>{content}</span>;
  }
  if (node.type === 'spec_token') {
    return (
      <span key={key} className="br-spec-token" data-field-id={node.field_id}>
        {node.display_value}
      </span>
    );
  }
  return (
    <a key={key} href={node.href} className="br-link">
      {node.nodes.map((child, i) => renderNode(child, i))}
    </a>
  );
}

export function RichText({ content }: { content: RichTextContent }) {
  return <>{content.nodes.map((node, i) => renderNode(node, i))}</>;
}
