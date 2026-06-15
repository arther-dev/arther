'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { docToRichText, richTextToDoc, type PMDoc } from '@arther/block-renderer';
import type { RichTextContent } from '@arther/types';

/**
 * G4.3 — the inline spec token as a ProseMirror **atom** node: non-editable by
 * construction (`atom: true`, `contenteditable=false`), it carries the resolved
 * value attrs and renders its `display_value`. The author can place or delete it
 * as a unit but can never hand-type a value — values stay grounded (invariant 6).
 */
const SpecToken = Node.create({
  name: 'specToken',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      field_id: { default: null },
      field_version_id: { default: null },
      display_value: { default: '' },
      unit_id: { default: null },
      product_id: { default: null },
      component_id: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-spec-token]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-spec-token': '',
        class: 'br-spec-token',
        contenteditable: 'false',
      }),
      String(node.attrs.display_value ?? ''),
    ];
  },
});

/**
 * One block's rich text, editable. Loads from `RichTextContent` via the shared
 * conversion and reports the edited value (as `RichTextContent`) on blur. Block
 * structure (type, heading level, callout variant) is fixed here — that's the
 * property editors' job (G4.2).
 */
export function RichTextEditor({
  value,
  onSave,
}: {
  value: RichTextContent;
  onSave: (next: RichTextContent) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Superscript,
      Subscript,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      SpecToken,
    ],
    content: richTextToDoc(value),
    onBlur: ({ editor: e }) => onSave(docToRichText(e.getJSON() as PMDoc)),
  });

  if (!editor) return null;
  return <EditorContent editor={editor} className="br-editor" />;
}
