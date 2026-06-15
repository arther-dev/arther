import type {
  AiRichTextContent,
  AiSafetyChild,
  BlockContent,
  DegradationConfig,
  GeneratedBlock,
  GeneratedSection,
  RichTextContent,
  SafetyChild,
} from './block-content';
import type { BlockSource } from './document';
import type { BlockType } from './document-types';
import type { SpecFieldId } from './ids';

/**
 * G2.2/G2.3/G2.5 — turn a model-authored section (`GeneratedSection`, whose
 * inline spec tokens carry only a `field_id`) into commit-ready blocks, resolving
 * every token against the live spec graph. The model never mints a value: the
 * resolver supplies the current `field_version_id` + formatted `display_value`
 * (mirroring import). A token whose `field_id` doesn't resolve is a
 * hallucination — it is dropped from the output and reported in
 * `unresolvedFieldIds`, so the caller rejects the section (invariant 6). When
 * `unresolvedFieldIds` is empty the blocks are fully grounded and ready for the
 * 0018 `commit_generation` RPC (which independently re-resolves each ref to the
 * current version at the atomic commit).
 *
 * Pure — the resolver is injected, so this is exhaustively unit-testable without
 * a DB or the gateway.
 */

/** The commit contract consumed by `commitGeneration` (ADR-012, one source). */
export interface GenerationCommitBlock {
  type: BlockType;
  source: BlockSource;
  content: BlockContent;
  degradation?: DegradationConfig;
  textContent?: string | null;
  /** Fields this block cites — resolved to current versions in the commit RPC. */
  specRefs?: { fieldId: SpecFieldId }[];
}

/** What the spec graph supplies for one referenced field at resolution time. */
export interface ResolvedField {
  fieldVersionId: string;
  displayValue: string;
  /** null for unitless fields. */
  unitId: string | null;
  productId: string;
  /** null for product-owned fields. */
  componentId: string | null;
}

export type FieldResolver = (fieldId: string) => ResolvedField | null;

export interface AssembledSection {
  blocks: GenerationCommitBlock[];
  /** field_ids the model cited that don't resolve — zero-hallucination failures. */
  unresolvedFieldIds: string[];
}

function nodeText(node: RichTextContent['nodes'][number]): string {
  if (node.type === 'text') return node.text;
  if (node.type === 'spec_token') return node.display_value;
  return node.nodes.map(nodeText).join('');
}

function richText(content: RichTextContent): string {
  return content.nodes.map(nodeText).join('');
}

/** Resolve an AI rich-text body into a persisted one, threading refs + misses. */
function resolveRich(
  content: AiRichTextContent,
  resolve: FieldResolver,
  unresolved: Set<string>,
  refs: Set<string>,
): RichTextContent {
  const nodes: RichTextContent['nodes'] = [];
  for (const node of content.nodes) {
    if (node.type === 'text') {
      nodes.push({ type: 'text', text: node.text, marks: node.marks });
      continue;
    }
    const resolved = resolve(node.field_id);
    if (!resolved) {
      unresolved.add(node.field_id);
      continue;
    }
    refs.add(node.field_id);
    nodes.push({
      type: 'spec_token',
      field_id: node.field_id,
      field_version_id: resolved.fieldVersionId,
      display_value: resolved.displayValue,
      unit_id: resolved.unitId,
      product_id: resolved.productId,
      component_id: resolved.componentId,
    });
  }
  return { alignment: content.alignment, nodes };
}

function assembleSafetyChild(
  child: AiSafetyChild,
  resolve: FieldResolver,
  unresolved: Set<string>,
  refs: Set<string>,
): SafetyChild {
  if (child.type === 'heading') {
    return { type: 'heading', level: child.level, content: resolveRich(child.content, resolve, unresolved, refs) };
  }
  return { type: 'paragraph', content: resolveRich(child.content, resolve, unresolved, refs) };
}

function assembleContent(
  gb: GeneratedBlock,
  resolve: FieldResolver,
  unresolved: Set<string>,
  refs: Set<string>,
): BlockContent {
  switch (gb.block_type) {
    case 'heading':
      return { type: 'heading', level: gb.block.level, content: resolveRich(gb.block.content, resolve, unresolved, refs) };
    case 'paragraph':
      return { type: 'paragraph', content: resolveRich(gb.block.content, resolve, unresolved, refs) };
    case 'callout':
      return {
        type: 'callout',
        variant: gb.block.variant,
        title: gb.block.title,
        content: resolveRich(gb.block.content, resolve, unresolved, refs),
      };
    case 'spec_table':
      for (const row of gb.block.rows) {
        if (resolve(row.field_id)) refs.add(row.field_id);
        else unresolved.add(row.field_id);
      }
      return gb.block;
    case 'warning':
      return { type: 'warning', title: gb.block.title, children: gb.block.children.map((c) => assembleSafetyChild(c, resolve, unresolved, refs)) };
    case 'caution':
      return { type: 'caution', title: gb.block.title, children: gb.block.children.map((c) => assembleSafetyChild(c, resolve, unresolved, refs)) };
    case 'note':
      return { type: 'note', title: gb.block.title, children: gb.block.children.map((c) => assembleSafetyChild(c, resolve, unresolved, refs)) };
  }
}

/** Plain-text projection of a block (the FTS source written to `blocks.text_content`). */
export function blockPlainText(content: BlockContent): string {
  switch (content.type) {
    case 'heading':
    case 'paragraph':
      return richText(content.content);
    case 'callout':
      return [content.title, richText(content.content)].filter(Boolean).join(' ');
    case 'warning':
    case 'caution':
    case 'note':
      return [content.title, ...content.children.map((c) => blockPlainText(c))].filter(Boolean).join(' ');
    case 'spec_table':
      return content.title ?? '';
    default:
      return '';
  }
}

/** Resolve + assemble one generated section into commit-ready blocks. */
export function resolveGeneratedSection(
  section: GeneratedSection,
  resolve: FieldResolver,
): AssembledSection {
  const unresolved = new Set<string>();
  const blocks: GenerationCommitBlock[] = [];
  for (const gb of section.blocks) {
    const refs = new Set<string>();
    const content = assembleContent(gb, resolve, unresolved, refs);
    blocks.push({
      type: gb.block_type,
      source: gb.source,
      content,
      textContent: blockPlainText(content),
      specRefs: [...refs].map((fieldId) => ({ fieldId: fieldId as SpecFieldId })),
    });
  }
  return { blocks, unresolvedFieldIds: [...unresolved] };
}
