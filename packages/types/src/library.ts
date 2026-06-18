import { z } from 'zod';
import { TEXT_LIMITS } from './text';

/**
 * R.1 — Content Reuse: the block library. A `LibraryItem` is a named, self-
 * contained sequence of blocks that lives in the workspace library as either a
 * **snippet** (live transclusion — edits propagate to every embed) or a
 * **template** (copy-on-insert — an independent starter, no live link). This
 * module is the pure layer: the type vocabulary, friendly labels, and the
 * create/rename input schemas. Embeds, versioning rollback, and the override
 * model are wired by the data layer + later R slices.
 */

export const LIBRARY_ITEM_TYPES = ['snippet', 'template'] as const;
export type LibraryItemType = (typeof LIBRARY_ITEM_TYPES)[number];

/** The author-facing label for a library item type. */
export function libraryItemTypeLabel(type: LibraryItemType): string {
  return type === 'snippet' ? 'Snippet' : 'Template';
}

/** One-line description of how each type behaves on insertion (the picker copy). */
export function libraryItemTypeDescription(type: LibraryItemType): string {
  return type === 'snippet'
    ? 'Live content — edits to the source propagate to every document that embeds it.'
    : 'A copy-on-insert starter — inserting it creates an independent, freely editable copy.';
}

const name = z
  .string()
  .trim()
  .min(1, 'Give the item a name.')
  .max(TEXT_LIMITS.name, `Keep the name under ${TEXT_LIMITS.name} characters.`);

export const createLibraryItemSchema = z.object({
  name,
  type: z.enum(LIBRARY_ITEM_TYPES),
});
export type CreateLibraryItemInput = z.infer<typeof createLibraryItemSchema>;

export const renameLibraryItemSchema = z.object({ name });
export type RenameLibraryItemInput = z.infer<typeof renameLibraryItemSchema>;
