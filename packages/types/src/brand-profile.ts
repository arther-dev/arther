import { z } from 'zod';
import { optionalText, requiredText, TEXT_LIMITS } from './text';

/**
 * G0.4 Brand Profiles — the workspace-level identity configuration the generator
 * consumes for presentation (logo, palette, typography, voice, glossary, unit
 * preference). The interface is owned by the AI Document Generator spec (§4.3);
 * this module is the one source (ADR-012) for the editor form schema and the
 * pure parsers that turn the admin's free-text inputs into the stored JSONB
 * shapes — shared by the action boundary and unit-tested in isolation.
 */

export const UNIT_PREFERENCES = ['metric', 'imperial', 'both'] as const;
export type UnitPreference = (typeof UNIT_PREFERENCES)[number];

/** Stored shapes (mirror the 0004 columns). */
export interface BrandTypography {
  heading_font?: string;
  body_font?: string;
}
export interface BrandGlossary {
  /** 'motor controller' → 'servo drive' */
  preferred_terms: Record<string, string>;
  prohibited_terms: string[];
}

/**
 * Split a comma/newline-separated free-text list into trimmed, case-insensitively
 * de-duplicated entries (preserving the first-seen casing). Used for voice
 * descriptors and prohibited terms.
 */
export function parseStringList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const trimmed = part.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Parse "term => preferred" lines (also accepts `->`, `:`, `=`) into a
 * preferred-terms map. Blank and malformed lines are skipped; last write wins
 * on a repeated term. The inverse of {@link formatPreferredTerms}.
 */
export function parsePreferredTerms(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*(.+?)\s*(?:=>|->|:|=)\s*(.+?)\s*$/);
    if (match) {
      const from = match[1]?.trim();
      const to = match[2]?.trim();
      if (from && to) map[from] = to;
    }
  }
  return map;
}

/** Render a preferred-terms map back to editable "term => preferred" lines. */
export function formatPreferredTerms(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([from, to]) => `${from} => ${to}`)
    .join('\n');
}

/** Hex colour like #1A2B3C or #abc; empty is allowed (no palette set). */
const hexColour = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour like #1A2B3C.');

/**
 * The Brand Profile editor form (raw inputs as the admin types them). Bounds
 * every free-text field (F8.5). The action layer turns these into the stored
 * JSONB shapes via the parsers above.
 */
export const brandProfileFormSchema = z.object({
  name: requiredText('Name the brand profile.'),
  logoUrl: z.union([z.string().trim().url('Enter a valid logo URL.'), z.literal('')]).optional(),
  primaryColour: z.union([hexColour, z.literal('')]).optional(),
  headingFont: optionalText(TEXT_LIMITS.name),
  bodyFont: optionalText(TEXT_LIMITS.name),
  voiceDescriptors: optionalText(TEXT_LIMITS.notes),
  toneNotes: optionalText(TEXT_LIMITS.notes),
  preferredTerms: optionalText(TEXT_LIMITS.notes),
  prohibitedTerms: optionalText(TEXT_LIMITS.notes),
  unitPreference: z.enum(UNIT_PREFERENCES),
});
export type BrandProfileForm = z.infer<typeof brandProfileFormSchema>;
