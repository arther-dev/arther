import { blockPlainText, type BlockContent } from '@arther/types';

/**
 * The document outline (the editor's left panel, G4.1): the navigable structure
 * derived from a block tree — section headers and headings, in document order,
 * with a nesting level. Pure, so it's shared by the editor and any read view.
 */
export interface OutlineItem {
  id: string;
  label: string;
  /** 0 = section header, 1 = H2, 2 = H3. */
  level: number;
}

export function buildOutline(
  blocks: ReadonlyArray<{ id: string; content: BlockContent }>,
): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const block of blocks) {
    if (block.content.type === 'section_header') {
      items.push({ id: block.id, label: block.content.title || 'Section', level: 0 });
    } else if (block.content.type === 'heading') {
      items.push({
        id: block.id,
        label: blockPlainText(block.content) || 'Heading',
        level: block.content.level - 1,
      });
    }
  }
  return items;
}
