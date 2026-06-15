import { z } from 'zod';
import { requiredText, optionalText, TEXT_LIMITS } from './text';

/**
 * Document Types are the generation schema (G0.1/G0.2, AI Document Generator
 * spec §3.4). A Document Type IS the contract the generator fills: an ordered
 * list of sections, each mapping spec-field categories and brief-fragment keys
 * to a set of default block types. These schemas are the one source (ADR-012)
 * shared by the admin editor (validating writes) and, in G2, the generator's
 * section-scoped injection — so a section can never reference a block type the
 * editor can't render.
 */

/**
 * The canonical block-type set — kept in lockstep with the `blocks.type` CHECK
 * in migration 0005 and the Visual Block Editor spec §4.1. `default_block_types`
 * on a section may only name types from this list.
 */
export const BLOCK_TYPES = [
  // Structural
  'section_header',
  'divider',
  'page_break',
  'toc',
  // Prose
  'heading',
  'paragraph',
  'code_block',
  'callout',
  // Data
  'spec_table',
  'chart',
  // Safety
  'warning',
  'caution',
  'note',
  // Media
  'image',
  'video',
  'gif',
  'hotspot_image',
  // Interactive containers
  'accordion',
  'step_wizard',
  // Reuse
  'snippet',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockTypeSchema = z.enum(BLOCK_TYPES);

/**
 * The standard Product Brief fragment keys (generator spec §3.2). Brief keys
 * are free text — a section may reference workspace-specific keys — but these
 * are the suggested set the editor offers and the built-ins ship with.
 */
export const STANDARD_BRIEF_FRAGMENT_KEYS = [
  'overview',
  'target_applications',
  'key_differentiators',
  'regulatory_context',
  'compatibility_notes',
] as const;

/** A single free-text token used as a category tag or brief-fragment key. */
const tokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(TEXT_LIMITS.category, `Keep each entry under ${TEXT_LIMITS.category} characters.`);

/**
 * Parse a user-typed comma/newline-separated list (categories, brief keys) into
 * a de-duplicated, order-preserving token array. Empty input → []. Bounded so a
 * single oversized paste can't slip through the section-editor boundary.
 */
export function parseTokenList(raw: string | null | undefined, max = 50): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const token = part.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= max) break;
  }
  return out;
}

export const documentTypeNameSchema = requiredText('Name the document type.');
export const documentTypeDescriptionSchema = optionalText(TEXT_LIMITS.notes);

/** The section data contract (generator spec §4.2), validated at the write boundary. */
export const documentTypeSectionSchema = z.object({
  name: requiredText('Name the section.'),
  spec_field_categories: z.array(tokenSchema).max(50),
  brief_fragment_keys: z.array(tokenSchema).max(50),
  brief_required: z.boolean(),
  default_block_types: z.array(blockTypeSchema).max(BLOCK_TYPES.length),
});

/** Alias used at action boundaries to mirror the `DocumentTypeSectionInput` type name. */
export const documentTypeSectionInputSchema = documentTypeSectionSchema;

export type DocumentTypeSectionInput = z.infer<typeof documentTypeSectionSchema>;
