import type { BlockType } from './document-types';
import type { BlockContent, RichTextContent } from './block-content';
import { blockPlainText } from './generation-assembly';

/**
 * G6.2 — the two-speed propagation engine (Smart Spec Tracking, spec §3.1,
 * architecture §5.2). When a spec field's value moves on, every block that cites
 * it must react at one of two speeds:
 *
 *   • STRUCTURED (spec tables, charts, media) — the value is a live view; the
 *     working copy auto-updates silently, no human asked.
 *   • PROSE (paragraphs, headings, callouts, safety + container blocks) — the
 *     inline token auto-updates too, but the *surrounding sentence* may no longer
 *     be true, so the section is flagged for a human (routed via G6.3). Prose is
 *     never auto-rewritten (invariant 4).
 *
 * This module is the pure core: classify a block, rewrite its inline spec tokens
 * to the new value snapshot, attribute blocks to sections, and plan one field's
 * propagation over a document. The DB layer (`@arther/db`) supplies the blocks +
 * the resolved owner and applies the plan; published-snapshot isolation
 * (invariant 5 / G6.7) is a property of *where* the plan is applied (the working
 * copy only) — never expressed here.
 */

export type BlockSpeed = 'prose' | 'structured' | 'structural';

/**
 * Two-speed class per block type (spec §3.1). PROSE blocks carry sentences that a
 * value change can invalidate → flag for review. STRUCTURED blocks render spec
 * data directly (or are inert media) → auto-update only. STRUCTURAL blocks never
 * cite spec data.
 */
export const BLOCK_SPEED: Record<BlockType, BlockSpeed> = {
  // Prose — inline tokens live inside sentences a human must re-read.
  heading: 'prose',
  paragraph: 'prose',
  callout: 'prose',
  warning: 'prose',
  caution: 'prose',
  note: 'prose',
  accordion: 'prose',
  step_wizard: 'prose',
  // Structured — live views of spec data, or inert media. Auto-update, no review.
  spec_table: 'structured',
  chart: 'structured',
  image: 'structured',
  video: 'structured',
  gif: 'structured',
  hotspot_image: 'structured',
  code_block: 'structured',
  snippet: 'structured',
  // Structural — markers, never cite a field.
  section_header: 'structural',
  divider: 'structural',
  page_break: 'structural',
  toc: 'structural',
};

export function classifyBlockSpeed(type: BlockType): BlockSpeed {
  return BLOCK_SPEED[type];
}

/** The new value snapshot written into a matching inline `spec_token` node. */
export interface SpecTokenReplacement {
  fieldVersionId: string;
  displayValue: string;
}

/** Rewrite every inline `spec_token` for `fieldId` inside a rich-text block. */
function rewriteRichText(
  rt: RichTextContent,
  fieldId: string,
  replacement: SpecTokenReplacement,
): { rt: RichTextContent; count: number } {
  let count = 0;
  const nodes = rt.nodes.map((node) => {
    if (node.type === 'spec_token' && node.field_id === fieldId) {
      count += 1;
      return {
        ...node,
        field_version_id: replacement.fieldVersionId,
        display_value: replacement.displayValue,
      };
    }
    if (node.type === 'link') {
      const inner = node.nodes.map((child) => {
        if (child.type === 'spec_token' && child.field_id === fieldId) {
          count += 1;
          return {
            ...child,
            field_version_id: replacement.fieldVersionId,
            display_value: replacement.displayValue,
          };
        }
        return child;
      });
      return { ...node, nodes: inner };
    }
    return node;
  });
  return { rt: { ...rt, nodes }, count };
}

/**
 * Advance every inline `spec_token` backed by `fieldId` to the new version +
 * display value, anywhere it appears in a block's content (rich text, captions,
 * safety children, accordion/wizard section children — recursively). Returns a
 * new content value and how many tokens moved. Structured/structural blocks with
 * no inline tokens return the input unchanged with `count: 0`.
 */
export function rewriteSpecTokens(
  content: BlockContent,
  fieldId: string,
  replacement: SpecTokenReplacement,
): { content: BlockContent; count: number } {
  switch (content.type) {
    case 'heading':
    case 'paragraph':
    case 'callout': {
      const { rt, count } = rewriteRichText(content.content, fieldId, replacement);
      return count === 0 ? { content, count } : { content: { ...content, content: rt }, count };
    }
    case 'image':
    case 'video':
    case 'gif':
    case 'hotspot_image': {
      if (!content.caption) return { content, count: 0 };
      const { rt, count } = rewriteRichText(content.caption, fieldId, replacement);
      return count === 0 ? { content, count } : { content: { ...content, caption: rt }, count };
    }
    case 'warning':
    case 'caution':
    case 'note': {
      let count = 0;
      const children = content.children.map((child) => {
        const r = rewriteSpecTokens(child, fieldId, replacement);
        count += r.count;
        return r.content as (typeof content.children)[number];
      });
      return count === 0 ? { content, count } : { content: { ...content, children }, count };
    }
    case 'accordion': {
      let count = 0;
      const sections = content.sections.map((section) => {
        const children = section.children.map((child) => {
          const r = rewriteSpecTokens(child, fieldId, replacement);
          count += r.count;
          return r.content as (typeof section.children)[number];
        });
        return { ...section, children };
      });
      return count === 0 ? { content, count } : { content: { ...content, sections }, count };
    }
    case 'step_wizard': {
      let count = 0;
      const steps = content.steps.map((step) => {
        const children = step.children.map((child) => {
          const r = rewriteSpecTokens(child, fieldId, replacement);
          count += r.count;
          return r.content as (typeof step.children)[number];
        });
        return { ...step, children };
      });
      return count === 0 ? { content, count } : { content: { ...content, steps }, count };
    }
    default:
      // spec_table, chart, code_block, snippet, section_header, divider,
      // page_break, toc — no inline tokens. (Structured blocks read spec data
      // live; their reference anchor is advanced at the DB layer, not here.)
      return { content, count: 0 };
  }
}

/** The default section bucket for blocks before the first `section_header`. */
export const DEFAULT_SECTION_NAME = 'Document';

/**
 * Attribute each block to the section it lives under — the title of the nearest
 * preceding `section_header` (spec: domain owners review at the *section* level).
 * Blocks must arrive in `display_order`.
 */
export function attributeSections(
  blocks: ReadonlyArray<{ id: string; content: BlockContent }>,
  defaultSection: string = DEFAULT_SECTION_NAME,
): Map<string, string> {
  const byBlock = new Map<string, string>();
  let current = defaultSection;
  for (const block of blocks) {
    if (block.content.type === 'section_header') {
      current = block.content.title || defaultSection;
    }
    byBlock.set(block.id, current);
  }
  return byBlock;
}

export interface PropagationBlock {
  id: string;
  type: BlockType;
  content: BlockContent;
}

export interface BlockContentUpdate {
  blockId: string;
  content: BlockContent;
  textContent: string;
}

export interface ReviewSection {
  sectionName: string;
  category: string;
  /** The resolved domain owner (G6.3), or null when none could be determined. */
  ownerUserId: string | null;
  blockIds: string[];
}

export interface FieldPropagationPlan {
  /** Working-copy block rewrites (only blocks whose token actually moved). */
  blockUpdates: BlockContentUpdate[];
  /** Prose sections to flag for review — empty for draft documents. */
  reviewSections: ReviewSection[];
}

/**
 * Plan one field's propagation over a single document's working copy. Pure: the
 * caller supplies the document's blocks (in order), which of them anchor a stale
 * reference to the field, the new value snapshot, whether the document is
 * published, and the resolved owner for the field's category.
 *
 * - Every stale block with an inline token gets a content rewrite (both speeds).
 * - For a PUBLISHED document, stale PROSE blocks additionally group into section
 *   review items (draft documents get the silent auto-update only, spec §4 step
 *   4 / line 486).
 */
export function planFieldPropagation(input: {
  blocks: ReadonlyArray<PropagationBlock>;
  staleBlockIds: ReadonlySet<string>;
  fieldId: string;
  category: string;
  replacement: SpecTokenReplacement;
  published: boolean;
  ownerForCategory: string | null;
  defaultSection?: string;
}): FieldPropagationPlan {
  const sectionByBlock = attributeSections(input.blocks, input.defaultSection);
  const blockUpdates: BlockContentUpdate[] = [];
  const proseBySection = new Map<string, string[]>();

  for (const block of input.blocks) {
    if (!input.staleBlockIds.has(block.id)) continue;
    const { content, count } = rewriteSpecTokens(block.content, input.fieldId, input.replacement);
    if (count === 0) continue;
    blockUpdates.push({ blockId: block.id, content, textContent: blockPlainText(content) });

    if (input.published && classifyBlockSpeed(block.type) === 'prose') {
      const section = sectionByBlock.get(block.id) ?? (input.defaultSection ?? DEFAULT_SECTION_NAME);
      const list = proseBySection.get(section) ?? [];
      list.push(block.id);
      proseBySection.set(section, list);
    }
  }

  const reviewSections: ReviewSection[] = [...proseBySection.entries()].map(
    ([sectionName, blockIds]) => ({
      sectionName,
      category: input.category,
      ownerUserId: input.ownerForCategory,
      blockIds,
    }),
  );

  return { blockUpdates, reviewSections };
}
