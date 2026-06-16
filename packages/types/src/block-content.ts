import * as z from 'zod/v4';
import { type BlockType } from './document-types';
import { TEXT_LIMITS } from './text';

/**
 * G1.3 — the tool-use schema layer (ADR-007/ADR-012): the one Zod source for a
 * block's `content` payload and, derived from it, the JSON contract Claude fills
 * when the generator (G2) asks for a section's blocks.
 *
 * Authored against `zod/v4` — the engine the `@arther/ai-gateway` SDK helper
 * needs (the same posture `@arther/spec-import`'s interpretation contract takes);
 * the rest of `@arther/types` stays on classic v3 until the repo-wide move. Only
 * the numeric `TEXT_LIMITS` constants are borrowed across the boundary (plain
 * data, no schema mixing).
 *
 * Two faces of one model:
 *   • `blockContentSchema` — the full, persisted/editor content union for every
 *     one of the 20 block types (the Visual Block Editor spec §4.4–4.10). This
 *     is what validates `blocks.content` in G3 and what the editor reads/writes.
 *   • `generatedSectionSchema` — the leaner generation contract Claude emits: the
 *     AI-authorable subset, with inline spec tokens carrying only `field_id`
 *     (the app resolves the version + display value at commit, so the model can
 *     never mint a value — the generation-side zero-hallucination posture,
 *     mirroring import). `generationToolJsonSchema()` renders it to the tool-use
 *     JSON schema the gateway forces the model to call.
 *
 * Nesting is modelled per the spec's logical tree (an accordion holds sections,
 * a section holds children); the physical persistence mapping (nested JSONB vs.
 * `blocks.parent_block_id` rows) is settled in G3. Depth is bounded — containers
 * never hold Accordion/Step Wizard/Snippet (spec §4.11) — so no `z.lazy`.
 */

const idString = z.string().min(1);

/** A 3- or 6-digit hex colour (`#fff`, `#1a2b3c`); Brand Profile palette default. */
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Enter a hex colour.');

// --- Rich text (spec §4.2) ---------------------------------------------------

export const TEXT_MARK_TYPES = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'superscript',
  'subscript',
  'inline_code',
  'text_color',
  'highlight',
] as const;
export type TextMarkType = (typeof TEXT_MARK_TYPES)[number];

/** A formatting mark; `color` is only meaningful for `text_color`/`highlight`. */
export const textMarkSchema = z
  .strictObject({
    type: z.enum(TEXT_MARK_TYPES),
    color: hexColor.optional(),
  })
  .refine((m) => m.color === undefined || m.type === 'text_color' || m.type === 'highlight', {
    message: 'color is only valid on text_color or highlight marks',
    path: ['color'],
  });
export type TextMark = z.infer<typeof textMarkSchema>;

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

const textNodeSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().max(TEXT_LIMITS.comment),
  marks: z.array(textMarkSchema).max(TEXT_MARK_TYPES.length),
});

/**
 * The persisted/editor inline spec token (spec §4.2): a fully-resolved value
 * snapshot. `field_version_id` is the staleness anchor; `display_value` is the
 * rendered string the editor shows and the tracking layer recomputes on change.
 */
export const inlineSpecTokenNodeSchema = z.strictObject({
  type: z.literal('spec_token'),
  field_id: idString,
  field_version_id: idString,
  display_value: z.string().max(TEXT_LIMITS.name),
  /** null for unitless fields (booleans, enums) — the display value carries the text. */
  unit_id: idString.nullable(),
  product_id: idString,
  /** null for product-owned fields, which have no component. */
  component_id: idString.nullable(),
});

const linkNodeSchema = z.strictObject({
  type: z.literal('link'),
  href: z.string().max(TEXT_LIMITS.notes),
  nodes: z.array(z.discriminatedUnion('type', [textNodeSchema, inlineSpecTokenNodeSchema])),
});

export const richTextNodeSchema = z.discriminatedUnion('type', [
  textNodeSchema,
  inlineSpecTokenNodeSchema,
  linkNodeSchema,
]);

export const richTextContentSchema = z.strictObject({
  alignment: z.enum(TEXT_ALIGNMENTS),
  nodes: z.array(richTextNodeSchema),
});
export type RichTextContent = z.infer<typeof richTextContentSchema>;

// --- Degradation (spec §4.3) -------------------------------------------------

export const DEGRADATION_CONTRACT_TYPES = [
  'native',
  'flat_sections',
  'numbered_list',
  'static_image',
  'first_frame',
  'thumbnail_with_url',
  'numbered_legend',
  'omit',
] as const;
export type DegradationContractType = (typeof DEGRADATION_CONTRACT_TYPES)[number];

export const degradationContractSchema = z.strictObject({
  type: z.enum(DEGRADATION_CONTRACT_TYPES),
  /** true = the Arther-enforced default; false = a writer override. */
  default: z.boolean(),
});

export const degradationConfigSchema = z.strictObject({
  pdf: degradationContractSchema,
});
export type DegradationConfig = z.infer<typeof degradationConfigSchema>;

// --- Per-type content payloads (spec §4.4–4.10) ------------------------------
//
// Each schema carries the `type` literal plus that block type's own fields (the
// shape stored in `blocks.content`); the row-level base columns (id, source,
// display_order, …) live on the table, not here.

// Structural
const sectionHeaderContent = z.strictObject({
  type: z.literal('section_header'),
  title: z.string().max(TEXT_LIMITS.name),
  /** References DocumentTypeSection.id when AI-generated; null if hand-inserted. */
  document_type_section_id: idString.nullable().optional(),
});
const dividerContent = z.strictObject({ type: z.literal('divider') });
const pageBreakContent = z.strictObject({ type: z.literal('page_break') });
const tocContent = z.strictObject({
  type: z.literal('toc'),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  depth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

// Prose
const headingContent = z.strictObject({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  content: richTextContentSchema,
});
const paragraphContent = z.strictObject({
  type: z.literal('paragraph'),
  content: richTextContentSchema,
});
const codeBlockContent = z.strictObject({
  type: z.literal('code_block'),
  content: z.string().max(TEXT_LIMITS.briefFragment),
  language: z.string().max(TEXT_LIMITS.tag).optional(),
  caption: z.string().max(TEXT_LIMITS.name).optional(),
});
export const CALLOUT_VARIANTS = ['info', 'tip', 'important'] as const;
const calloutContent = z.strictObject({
  type: z.literal('callout'),
  variant: z.enum(CALLOUT_VARIANTS),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  content: richTextContentSchema,
});

// Data
export const SPEC_TABLE_UNIT_PREFERENCES = ['metric', 'imperial', 'workspace_default'] as const;
const specTableColumnConfig = z.strictObject({
  show_min: z.boolean(),
  show_typical: z.boolean(),
  show_max: z.boolean(),
  show_conditions: z.boolean(),
  show_source: z.boolean(),
  unit_preference: z.enum(SPEC_TABLE_UNIT_PREFERENCES),
  decimal_places: z.number().int().min(0).max(20).optional(),
});
const specTableRow = z.strictObject({
  field_id: idString,
  component_id: idString,
  display_order: z.number().int(),
  /** Document-local label override; null = use the field's own name. */
  display_label: z.string().max(TEXT_LIMITS.name).nullable().optional(),
  visible: z.boolean(),
});
const specTableContent = z.strictObject({
  type: z.literal('spec_table'),
  product_id: idString,
  title: z.string().max(TEXT_LIMITS.name).optional(),
  column_config: specTableColumnConfig,
  rows: z.array(specTableRow),
});
export const CHART_TYPES = ['line', 'scatter', 'bar'] as const;
const chartContent = z.strictObject({
  type: z.literal('chart'),
  table_field_id: idString,
  product_id: idString,
  title: z.string().max(TEXT_LIMITS.name).optional(),
  chart_type: z.enum(CHART_TYPES),
  x_axis_label: z.string().max(TEXT_LIMITS.name).optional(),
  y_axis_label: z.string().max(TEXT_LIMITS.name).optional(),
  show_legend: z.boolean(),
  show_grid: z.boolean(),
});

// Media
export const IMAGE_WIDTHS = ['full', 'half', 'quarter'] as const;
const imageContent = z.strictObject({
  type: z.literal('image'),
  url: z.string().max(TEXT_LIMITS.notes),
  storage_key: z.string().max(TEXT_LIMITS.notes),
  alt_text: z.string().max(TEXT_LIMITS.notes),
  caption: richTextContentSchema.optional(),
  width: z.enum(IMAGE_WIDTHS),
});
const videoContent = z.strictObject({
  type: z.literal('video'),
  url: z.string().max(TEXT_LIMITS.notes),
  thumbnail_url: z.string().max(TEXT_LIMITS.notes).optional(),
  caption: richTextContentSchema.optional(),
  autoplay: z.boolean(),
});
const gifContent = z.strictObject({
  type: z.literal('gif'),
  url: z.string().max(TEXT_LIMITS.notes),
  storage_key: z.string().max(TEXT_LIMITS.notes),
  alt_text: z.string().max(TEXT_LIMITS.notes),
  caption: richTextContentSchema.optional(),
});
const hotspotPin = z.strictObject({
  id: idString,
  number: z.number().int().positive(),
  x_percent: z.number().min(0).max(100),
  y_percent: z.number().min(0).max(100),
  label: z.string().max(TEXT_LIMITS.notes),
  /** post-MVP: links the pin to a live spec field (always null at MVP). */
  spec_field_id: idString.nullable().optional(),
  spec_product_id: idString.nullable().optional(),
});
const hotspotImageContent = z.strictObject({
  type: z.literal('hotspot_image'),
  url: z.string().max(TEXT_LIMITS.notes),
  storage_key: z.string().max(TEXT_LIMITS.notes),
  alt_text: z.string().max(TEXT_LIMITS.notes),
  caption: richTextContentSchema.optional(),
  pins: z.array(hotspotPin),
});

// Reuse
const snippetContent = z.strictObject({
  type: z.literal('snippet'),
  snippet_id: idString,
  snippet_name: z.string().max(TEXT_LIMITS.name),
  last_resolved_at: z.string().optional(),
});

// --- Containers (spec §4.7, §4.9, §4.11) -------------------------------------
//
// Permitted children are explicit (§4.11). Safety blocks are containers too, but
// the only containers allowed to nest are safety blocks inside accordion/wizard
// sections — Accordion/Step Wizard/Snippet are never children — so the tree is
// finite and needs no recursion.

/** Safety-block children: Paragraph, Heading, Image (spec §4.11). */
const safetyChildSchema = z.discriminatedUnion('type', [
  paragraphContent,
  headingContent,
  imageContent,
]);
export type SafetyChild = z.infer<typeof safetyChildSchema>;

const warningContent = z.strictObject({
  type: z.literal('warning'),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  children: z.array(safetyChildSchema),
});
const cautionContent = z.strictObject({
  type: z.literal('caution'),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  children: z.array(safetyChildSchema),
});
const noteContent = z.strictObject({
  type: z.literal('note'),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  children: z.array(safetyChildSchema),
});

/** Accordion-section / wizard-step children (spec §4.11). */
const containerSectionChildSchema = z.discriminatedUnion('type', [
  paragraphContent,
  headingContent,
  imageContent,
  warningContent,
  cautionContent,
  noteContent,
  specTableContent,
  chartContent,
]);

const accordionSection = z.strictObject({
  id: idString,
  title: z.string().max(TEXT_LIMITS.name),
  display_order: z.number().int(),
  default_open: z.boolean(),
  children: z.array(containerSectionChildSchema),
});
const accordionContent = z.strictObject({
  type: z.literal('accordion'),
  sections: z.array(accordionSection),
});
const wizardStep = z.strictObject({
  id: idString,
  title: z.string().max(TEXT_LIMITS.name),
  display_order: z.number().int(),
  children: z.array(containerSectionChildSchema),
});
const stepWizardContent = z.strictObject({
  type: z.literal('step_wizard'),
  steps: z.array(wizardStep),
});

// --- The one content union ---------------------------------------------------

/**
 * Every block type's `content` payload, discriminated on `type` (the order
 * matches `BLOCK_TYPES`). The single source consumed by the editor, the block
 * renderer, and the G3 persistence layer when validating `blocks.content`.
 */
export const blockContentSchema = z.discriminatedUnion('type', [
  sectionHeaderContent,
  dividerContent,
  pageBreakContent,
  tocContent,
  headingContent,
  paragraphContent,
  codeBlockContent,
  calloutContent,
  specTableContent,
  chartContent,
  warningContent,
  cautionContent,
  noteContent,
  imageContent,
  videoContent,
  gifContent,
  hotspotImageContent,
  accordionContent,
  stepWizardContent,
  snippetContent,
]);
export type BlockContent = z.infer<typeof blockContentSchema>;

// --- Manual block insertion (G4.6) -------------------------------------------
//
// The block types an author can insert by hand in the editor: the prose family
// (paragraph/heading/callout) edited inline, plus a section header (title via
// the inspector) and a divider. Data/media/container types are inserted through
// their own dedicated flows (they need a field/source picker), not this list.

export const INSERTABLE_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'callout',
  'section_header',
  'divider',
] as const satisfies readonly BlockType[];
export type InsertableBlockType = (typeof INSERTABLE_BLOCK_TYPES)[number];
export const insertableBlockTypeSchema = z.enum(INSERTABLE_BLOCK_TYPES);

/** A valid, empty `BlockContent` for a freshly inserted block of `type`. */
export function defaultBlockContent(type: InsertableBlockType): BlockContent {
  switch (type) {
    case 'heading':
      return { type: 'heading', level: 2, content: { alignment: 'left', nodes: [] } };
    case 'callout':
      return { type: 'callout', variant: 'info', content: { alignment: 'left', nodes: [] } };
    case 'section_header':
      return { type: 'section_header', title: '' };
    case 'divider':
      return { type: 'divider' };
    case 'paragraph':
    default:
      return { type: 'paragraph', content: { alignment: 'left', nodes: [] } };
  }
}

/** The author-facing label for an insertable block type (the editor's picker). */
export function insertableBlockLabel(type: InsertableBlockType): string {
  switch (type) {
    case 'heading':
      return 'Heading';
    case 'callout':
      return 'Callout';
    case 'section_header':
      return 'Section header';
    case 'divider':
      return 'Divider';
    case 'paragraph':
    default:
      return 'Paragraph';
  }
}

// --- Container child rules (spec §4.11), as data ------------------------------

const SAFETY_BLOCK_TYPES = ['warning', 'caution', 'note'] as const satisfies readonly BlockType[];

/** Block types that can hold children (spec §3.4). */
export const CONTAINER_BLOCK_TYPES = [
  'accordion',
  'step_wizard',
  ...SAFETY_BLOCK_TYPES,
] as const satisfies readonly BlockType[];
export type ContainerBlockType = (typeof CONTAINER_BLOCK_TYPES)[number];

const CONTAINER_SECTION_CHILDREN = [
  'paragraph',
  'heading',
  'image',
  'warning',
  'caution',
  'note',
  'spec_table',
  'chart',
] as const satisfies readonly BlockType[];

const SAFETY_CHILDREN = ['paragraph', 'heading', 'image'] as const satisfies readonly BlockType[];

/** The permitted child block types for each container (spec §4.11 table). */
export const PERMITTED_CHILD_BLOCK_TYPES: Record<ContainerBlockType, readonly BlockType[]> = {
  accordion: CONTAINER_SECTION_CHILDREN,
  step_wizard: CONTAINER_SECTION_CHILDREN,
  warning: SAFETY_CHILDREN,
  caution: SAFETY_CHILDREN,
  note: SAFETY_CHILDREN,
};

export function isContainerBlockType(type: BlockType): type is ContainerBlockType {
  return (CONTAINER_BLOCK_TYPES as readonly BlockType[]).includes(type);
}

/** Whether `child` may be placed directly inside `container` (spec §4.11). */
export function canContain(container: BlockType, child: BlockType): boolean {
  return (
    isContainerBlockType(container) && PERMITTED_CHILD_BLOCK_TYPES[container].includes(child)
  );
}

// --- The generation tool-use contract ----------------------------------------
//
// What Claude emits for a section (G2.2). Leaner than the persisted model on
// purpose: the inline token carries only `field_id` + product/component scope, so
// the model can never mint a `field_version_id` or `display_value` — the app
// resolves those from the live spec graph at commit (G2.5 zero-hallucination,
// mirroring import). The structural section header is inserted by the app from
// the DocumentTypeSection, so the model authors only body blocks.

/** The block source taxonomy the generator assigns (spec §3.3). */
export const GENERATED_BLOCK_SOURCES = ['spec', 'brief', 'placeholder', 'structural'] as const;
export type GeneratedBlockSource = (typeof GENERATED_BLOCK_SOURCES)[number];

/** A spec token the model places in prose — references a field, never a value. */
export const aiSpecTokenNodeSchema = z.strictObject({
  type: z.literal('spec_token'),
  field_id: idString,
  product_id: idString,
  component_id: idString,
});

const aiTextNodeSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().max(TEXT_LIMITS.comment),
  marks: z.array(textMarkSchema).max(TEXT_MARK_TYPES.length),
});

export const aiRichTextContentSchema = z.strictObject({
  alignment: z.enum(TEXT_ALIGNMENTS),
  nodes: z.array(z.discriminatedUnion('type', [aiTextNodeSchema, aiSpecTokenNodeSchema])),
});
export type AiRichTextContent = z.infer<typeof aiRichTextContentSchema>;

const aiHeadingBlock = z.strictObject({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  content: aiRichTextContentSchema,
});
const aiParagraphBlock = z.strictObject({
  type: z.literal('paragraph'),
  content: aiRichTextContentSchema,
});
const aiCalloutBlock = z.strictObject({
  type: z.literal('callout'),
  variant: z.enum(CALLOUT_VARIANTS),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  content: aiRichTextContentSchema,
});
const aiSafetyChild = z.discriminatedUnion('type', [aiParagraphBlock, aiHeadingBlock]);
export type AiSafetyChild = z.infer<typeof aiSafetyChild>;
const aiWarningBlock = z.strictObject({
  type: z.literal('warning'),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  children: z.array(aiSafetyChild),
});
const aiCautionBlock = z.strictObject({
  type: z.literal('caution'),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  children: z.array(aiSafetyChild),
});
const aiNoteBlock = z.strictObject({
  type: z.literal('note'),
  title: z.string().max(TEXT_LIMITS.name).optional(),
  children: z.array(aiSafetyChild),
});
const aiSpecTableBlock = z.strictObject({
  type: z.literal('spec_table'),
  product_id: idString,
  title: z.string().max(TEXT_LIMITS.name).optional(),
  column_config: specTableColumnConfig,
  rows: z.array(specTableRow),
});

/** The block types the generator is allowed to author (spec §3.3 / §4.7). */
export const AI_GENERATABLE_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'callout',
  'spec_table',
  'warning',
  'caution',
  'note',
] as const satisfies readonly BlockType[];

/**
 * One block as authored by the model. `source` distinguishes spec-grounded prose
 * from brief-derived prose and from placeholders (a body the model leaves for a
 * null required field, G2.7).
 */
export const generatedBlockSchema = z.discriminatedUnion('block_type', [
  z.strictObject({ block_type: z.literal('heading'), source: z.enum(GENERATED_BLOCK_SOURCES), block: aiHeadingBlock }),
  z.strictObject({ block_type: z.literal('paragraph'), source: z.enum(GENERATED_BLOCK_SOURCES), block: aiParagraphBlock }),
  z.strictObject({ block_type: z.literal('callout'), source: z.enum(GENERATED_BLOCK_SOURCES), block: aiCalloutBlock }),
  z.strictObject({ block_type: z.literal('spec_table'), source: z.enum(GENERATED_BLOCK_SOURCES), block: aiSpecTableBlock }),
  z.strictObject({ block_type: z.literal('warning'), source: z.enum(GENERATED_BLOCK_SOURCES), block: aiWarningBlock }),
  z.strictObject({ block_type: z.literal('caution'), source: z.enum(GENERATED_BLOCK_SOURCES), block: aiCautionBlock }),
  z.strictObject({ block_type: z.literal('note'), source: z.enum(GENERATED_BLOCK_SOURCES), block: aiNoteBlock }),
]);
export type GeneratedBlock = z.infer<typeof generatedBlockSchema>;

/** The model's result for one section-scoped generation call (G2.2). */
export const generatedSectionSchema = z.strictObject({
  /** Echoes the DocumentTypeSection name the call was scoped to. */
  section_name: z.string().max(TEXT_LIMITS.name),
  blocks: z.array(generatedBlockSchema),
});
export type GeneratedSection = z.infer<typeof generatedSectionSchema>;

/**
 * Render the section contract to the JSON schema the gateway forces the model to
 * call (`@arther/ai-gateway` does the same internally). Exposed so G2 — and the
 * contract test here — can confirm the schema survives the tool-use conversion.
 */
export function generationToolJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(generatedSectionSchema) as Record<string, unknown>;
}
