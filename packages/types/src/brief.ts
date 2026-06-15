import { z } from 'zod';
import { TEXT_LIMITS } from './text';

/**
 * Product Brief — the narrative layer the AI Document Generator draws from
 * (generator spec §3.2 / §5.7, Phase 2 G0.6). A brief mirrors the spec graph:
 * fragments live on the entity that owns them — a product OR a component — so a
 * shared component's narrative appears in every product that references it,
 * without duplication.
 *
 * Fragments are freeform PLAIN TEXT keyed by named fragment keys. The keys are
 * the structure document-type sections reference (`brief_fragment_keys`); their
 * GUIDANCE is Arther-defined and baked in here (spec §5.7: "Guidance text is
 * Arther-defined — baked into the standard fragment keys, not user-configurable")
 * — one source for the editor and the generator (ADR-012).
 */

export const briefEntityTypeSchema = z.enum(['product', 'component']);
export type BriefEntityType = z.infer<typeof briefEntityTypeSchema>;

export interface BriefFragmentSpec {
  key: string;
  label: string;
  /** What good content looks like for this key — shown in the editing surface. */
  guidance: string;
}

/**
 * The canonical fragment keys, in display order. The first five are the
 * standard narrative keys from generator spec §3.2; the rest are the keys the
 * built-in Document Types (migration 0004 seed) reference in their section
 * schemas, so every built-in template can be satisfied from the brief surface.
 */
export const BRIEF_FRAGMENTS: readonly BriefFragmentSpec[] = [
  {
    key: 'overview',
    label: 'Overview',
    guidance:
      'What this product is and why it exists. One or two paragraphs a reader new to it could understand — the problem it solves, not its specifications.',
  },
  {
    key: 'target_applications',
    label: 'Target applications',
    guidance:
      'The primary use cases and target markets. Focus on industries and application types, not technical specifications.',
  },
  {
    key: 'key_differentiators',
    label: 'Key differentiators',
    guidance:
      'What makes this better than the alternatives. Concrete, defensible advantages — not marketing superlatives.',
  },
  {
    key: 'regulatory_context',
    label: 'Regulatory context',
    guidance:
      'The narrative around certifications and approvals (CE, UL, ATEX, …). The story, not the spec values — those live as spec fields.',
  },
  {
    key: 'compatibility_notes',
    label: 'Compatibility notes',
    guidance:
      'What this works with and what it does not. Interfaces, ecosystems, and known incompatibilities.',
  },
  {
    key: 'compliance_context',
    label: 'Compliance context',
    guidance:
      'The compliance narrative for a datasheet: which directives and standards apply and what they mean for the reader.',
  },
  {
    key: 'safety_context',
    label: 'Safety context',
    guidance:
      'Safety considerations for installation and use — the warnings and cautions a reader must understand before proceeding.',
  },
  {
    key: 'installation_context',
    label: 'Installation context',
    guidance:
      'How this is installed and set up. The sequence, prerequisites, and gotchas — written as guidance, not exact step values.',
  },
  {
    key: 'operation_context',
    label: 'Operation context',
    guidance:
      'How the product is operated day to day — the modes, controls, and expected behaviour during normal use.',
  },
  {
    key: 'maintenance_context',
    label: 'Maintenance context',
    guidance:
      'Routine maintenance, service intervals, and care. What keeps the product working and how often it needs attention.',
  },
  {
    key: 'package_contents',
    label: "What's in the box",
    guidance:
      'What ships with the product — the parts, accessories, and documentation a user finds on unboxing.',
  },
  {
    key: 'declaration_context',
    label: 'Declaration context',
    guidance:
      'The formal declaration narrative for a Declaration of Conformity — the manufacturer statement and its scope.',
  },
] as const;

const FRAGMENT_BY_KEY = new Map(BRIEF_FRAGMENTS.map((f) => [f.key, f]));

/** The canonical guidance for a key, or undefined for a non-standard key. */
export function briefGuidance(key: string): string | undefined {
  return FRAGMENT_BY_KEY.get(key)?.guidance;
}

/** Turn a fragment key into a human label, falling back to a humanised key. */
export function briefKeyLabel(key: string): string {
  return FRAGMENT_BY_KEY.get(key)?.label ?? humanizeBriefKey(key);
}

/** `target_applications` → `Target applications` for unrecognised keys. */
export function humanizeBriefKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isKnownBriefKey(key: string): boolean {
  return FRAGMENT_BY_KEY.has(key);
}

/**
 * Compute the ordered set of fragment keys to surface for an entity: the
 * canonical keys first (their fixed order), then any extra keys already present
 * on the entity or referenced by a document-type section, alphabetically.
 */
export function orderBriefKeys(extraKeys: Iterable<string>): string[] {
  const canonical = BRIEF_FRAGMENTS.map((f) => f.key);
  const known = new Set(canonical);
  const extra = [...new Set([...extraKeys].filter((k) => !known.has(k)))].sort();
  return [...canonical, ...extra];
}

/**
 * A fragment key as written by a section schema or the editor: a lowercase
 * slug. Validating the shape (not an allow-list) keeps custom Document Types
 * free to define their own keys while bounding the input (F8.5).
 */
export const briefFragmentKeySchema = z
  .string()
  .trim()
  .min(1, 'A fragment key is required.')
  .max(64, 'Keep the key under 64 characters.')
  .regex(/^[a-z][a-z0-9_]*$/, 'Use a lowercase key like target_applications.');

/** Fragment bodies are plain text, generously bounded (F8.5). Empty = cleared. */
export const briefFragmentContentSchema = z
  .string()
  .max(TEXT_LIMITS.briefFragment, `Keep it under ${TEXT_LIMITS.briefFragment} characters.`);

export const briefFragmentFormSchema = z.object({
  entityType: briefEntityTypeSchema,
  entityId: z.string().uuid(),
  key: briefFragmentKeySchema,
  content: briefFragmentContentSchema,
});
export type BriefFragmentForm = z.infer<typeof briefFragmentFormSchema>;
