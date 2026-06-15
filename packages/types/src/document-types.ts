import { z } from 'zod';
import { optionalText, requiredText, TEXT_LIMITS } from './text';

/**
 * Document Type input contracts (G0.1, generator spec §3.4 / §4.2). One schema
 * source for the create/rename/fork boundaries (ADR-012) — the action layer
 * `safeParse`s these and the repository writes the validated shape. The richer
 * per-section schema (categories, brief keys, block types) lands with G0.2.
 */

/** A Document Type's name + optional description — used by create and rename. */
export const documentTypeDetailsSchema = z.object({
  name: requiredText('Name the document type.'),
  description: optionalText(TEXT_LIMITS.notes),
});

export type DocumentTypeDetails = z.infer<typeof documentTypeDetailsSchema>;

/** Forking only needs an optional rename; the schema copies everything else. */
export const forkDocumentTypeSchema = z.object({
  /** When omitted the fork keeps the source name (the RPC coalesces). */
  name: optionalText(TEXT_LIMITS.name),
});
