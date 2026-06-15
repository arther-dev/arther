import { z } from 'zod';
import type { BlockContent, DegradationConfig } from './block-content';
import type { BlockType } from './document-types';
import { briefEntityTypeSchema, briefFragmentKeySchema } from './brief';
import { requiredText, TEXT_LIMITS } from './text';

/**
 * G3 — the documents/blocks persistence contract (Phase 2 G3.1–G3.3, migration
 * 0005). The one Zod source (ADR-012) for the row-level shape of a document, its
 * revisions, and the block tree, shared by the `@arther/db` repository (which
 * validates every write through it) and, in G2/G4, the generator and editor.
 *
 * The per-type block `content` payload (the 20-type union) and degradation
 * contracts live in `block-content.ts` (G1.3, authored against zod/v4 for the
 * gateway helper); this module imports those only as TYPES. The row-level
 * columns — `type`, `source`, `display_order`, references — live here, in
 * classic v3 like the rest of the repo's persistence schemas.
 *
 * Persistence decision (the mapping G1.3 deferred to G3): a top-level block is
 * one `blocks` row, ordered by `display_order`. Container interiors (accordion
 * sections/steps and safety-block children) persist INLINE in the container's
 * `content`, exactly as `blockContentSchema` models them — this is forced for
 * Accordion/Step Wizard (their section→children shape is two logical levels and
 * cannot map to the one-level `blocks.parent_block_id`) and applied uniformly so
 * every container has one model. `parent_block_id` is therefore reserved (null
 * this phase); the migration's "one-level containers" note is superseded by the
 * inline-content model the G1.3 union established.
 */

// --- Revision lifecycle (migration 0005 document_revisions.state CHECK) -------

export const DOCUMENT_STATES = ['draft', 'review', 'approved', 'published'] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];
export const documentStateSchema = z.enum(DOCUMENT_STATES);

// --- Block taxonomy (migration 0005 blocks.source / reference_type CHECKs) ----

/**
 * Where a block came from (spec §3.3). Broader than the generator's four-value
 * `GENERATED_BLOCK_SOURCES`: `manual` (a writer added it) and `snippet` (a reuse
 * instance) only ever arise after generation, so they belong to persistence.
 */
export const BLOCK_SOURCES = [
  'spec',
  'brief',
  'placeholder',
  'manual',
  'snippet',
  'structural',
] as const;
export type BlockSource = (typeof BLOCK_SOURCES)[number];
export const blockSourceSchema = z.enum(BLOCK_SOURCES);

/** How a block→field reference was made (migration 0005 block_spec_references). */
export const BLOCK_REFERENCE_TYPES = ['generated', 'manually_linked', 'chart'] as const;
export type BlockReferenceType = (typeof BLOCK_REFERENCE_TYPES)[number];
export const blockReferenceTypeSchema = z.enum(BLOCK_REFERENCE_TYPES);

// --- Document identity --------------------------------------------------------

/** A document slug is unique per product (migration 0005 `unique(product_id, slug)`). */
export const documentSlugSchema = z
  .string()
  .trim()
  .min(1, 'A slug is required.')
  .max(80, 'Keep the slug under 80 characters.')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase alphanumeric with inner hyphens');

/** Derive a per-product-unique-able slug from a document title. */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'document'
  );
}

/** The create-a-document contract; the slug is derived from the title by the repo. */
export const documentCreateSchema = z.object({
  title: requiredText('Give the document a title.'),
  productId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  brandProfileId: z.string().uuid().optional(),
});
export type DocumentCreate = z.infer<typeof documentCreateSchema>;

// --- Block write input --------------------------------------------------------

/**
 * The plain-text projection the editor writes on every save (the FTS source —
 * migration 0005 derives `text_search` from it). Bounded per F8.5; a whole
 * block's prose, never the rich-text tree.
 */
export const blockTextContentSchema = z
  .string()
  .max(TEXT_LIMITS.briefFragment, `Keep it under ${TEXT_LIMITS.briefFragment} characters.`);

/**
 * One block to persist. `content` is validated against the full
 * `blockContentSchema` by the repository (its `type` must match `type`);
 * `displayOrder` positions the block among its siblings.
 */
export interface BlockInput {
  type: BlockType;
  source: BlockSource;
  displayOrder: number;
  content: BlockContent;
  degradation?: DegradationConfig;
  textContent?: string | null;
}

// --- Reference write inputs (the tracking spine, migration 0005) --------------

/** A block→spec-field reference: `fieldVersionId` is the staleness anchor. */
export const blockSpecReferenceInputSchema = z.object({
  blockId: z.string().uuid(),
  fieldId: z.string().uuid(),
  fieldVersionId: z.string().uuid(),
  releaseId: z.string().uuid().optional(),
  referenceType: blockReferenceTypeSchema.default('generated'),
});
export type BlockSpecReferenceInput = z.infer<typeof blockSpecReferenceInputSchema>;

/** A block→brief-fragment reference (one per block — migration 0005 `unique(block_id)`). */
export const blockBriefReferenceInputSchema = z.object({
  blockId: z.string().uuid(),
  briefId: z.string().uuid(),
  fragmentKey: briefFragmentKeySchema,
  contentSnapshot: z
    .string()
    .max(TEXT_LIMITS.briefFragment, `Keep it under ${TEXT_LIMITS.briefFragment} characters.`)
    .optional(),
});
export type BlockBriefReferenceInput = z.infer<typeof blockBriefReferenceInputSchema>;

/** A placeholder block waiting on a brief fragment that is not yet written (G2.7). */
export const placeholderBriefReferenceInputSchema = z.object({
  blockId: z.string().uuid(),
  entityType: briefEntityTypeSchema,
  entityId: z.string().uuid(),
  fragmentKey: briefFragmentKeySchema,
  sectionName: z.string().trim().max(TEXT_LIMITS.name).optional(),
});
export type PlaceholderBriefReferenceInput = z.infer<typeof placeholderBriefReferenceInputSchema>;
