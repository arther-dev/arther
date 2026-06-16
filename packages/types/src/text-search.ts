import type { BlockContent, RichTextContent } from './block-content';

/**
 * G4.7 — find & replace over a document's blocks. Pure, literal (case-sensitive)
 * matching across the editable text of a block: rich-text `text` nodes (and the
 * text inside links), callout titles, and section-header titles. Inline spec
 * tokens are resolved values, never plain text, so they are never matched or
 * rewritten (invariant 6). The editor composes these per-block helpers over the
 * block list for the match count, navigation, and replace-all.
 */

function countOccurrences(haystack: string, query: string): number {
  if (!query) return 0;
  return haystack.split(query).length - 1;
}

/** Map every editable text string in a rich-text value; spec tokens untouched. */
function mapRichText(rt: RichTextContent, f: (s: string) => string): RichTextContent {
  return {
    ...rt,
    nodes: rt.nodes.map((node) => {
      if (node.type === 'text') return { ...node, text: f(node.text) };
      if (node.type === 'link') {
        return {
          ...node,
          nodes: node.nodes.map((n) => (n.type === 'text' ? { ...n, text: f(n.text) } : n)),
        };
      }
      return node; // spec_token — a resolved value, never rewritten
    }),
  };
}

/** Apply `f` to every editable text string in a block (rich-text + titles). */
export function mapBlockText(content: BlockContent, f: (s: string) => string): BlockContent {
  switch (content.type) {
    case 'paragraph':
    case 'heading':
      return { ...content, content: mapRichText(content.content, f) };
    case 'callout':
      return {
        ...content,
        content: mapRichText(content.content, f),
        ...(content.title !== undefined ? { title: f(content.title) } : {}),
      };
    case 'section_header':
      return { ...content, title: f(content.title) };
    default:
      return content;
  }
}

/** How many times `query` occurs in a block's editable text. */
export function countMatchesInBlock(content: BlockContent, query: string): number {
  if (!query) return 0;
  let total = 0;
  mapBlockText(content, (s) => {
    total += countOccurrences(s, query);
    return s;
  });
  return total;
}

/** Replace every `query` with `replacement` in a block's editable text. */
export function replaceInBlock(
  content: BlockContent,
  query: string,
  replacement: string,
): { content: BlockContent; replaced: number } {
  if (!query) return { content, replaced: 0 };
  let replaced = 0;
  const next = mapBlockText(content, (s) => {
    const occurrences = countOccurrences(s, query);
    if (occurrences === 0) return s;
    replaced += occurrences;
    return s.split(query).join(replacement);
  });
  return replaced > 0 ? { content: next, replaced } : { content, replaced: 0 };
}
