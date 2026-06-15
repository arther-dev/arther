import { z } from 'zod';
import { requiredText, TEXT_LIMITS } from './text';

/**
 * G0.5 Document Quality Standards — the editorial-discipline configuration the
 * generator is held to (section length limits, required structural elements,
 * voice/mood rules per block type, conditions-metadata requirements). Separate
 * from Brand Profiles by design: Brand shapes presentation, the Quality Standard
 * shapes output discipline, and they're owned by different people (generator
 * spec §3.5). A standard is referenced by Document Types; one standard can apply
 * across many types.
 *
 * The interface (`QualityConstraint`) is owned by the AI Document Generator spec
 * (§4.4); this module is the one source (ADR-012) for the editor form schema and
 * the pure parsers that turn the admin's pipe-delimited free text into the stored
 * `constraints` JSONB — shared by the action boundary and unit-tested in isolation.
 */

export const QUALITY_CONSTRAINT_SCOPES = ['global', 'section', 'block_type'] as const;
export type QualityConstraintScope = (typeof QUALITY_CONSTRAINT_SCOPES)[number];

/** Stored shape (one element of the 0004 `document_quality_standards.constraints` array). */
export interface QualityConstraint {
  scope: QualityConstraintScope;
  /** Section name or block type when the scope is not global. */
  target?: string;
  /** The machine/human rule, e.g. 'max_words: 150', 'require_conditions_column: true'. */
  rule: string;
  /** Human-readable explanation of the rule. */
  description?: string;
}

/** Hard ceiling on the number of constraints a single standard can carry (F8.5). */
export const MAX_QUALITY_CONSTRAINTS = 200;

export const qualityConstraintSchema = z.object({
  scope: z.enum(QUALITY_CONSTRAINT_SCOPES),
  target: z.string().trim().max(TEXT_LIMITS.name).optional(),
  rule: z.string().trim().min(1).max(TEXT_LIMITS.name),
  description: z.string().trim().max(TEXT_LIMITS.notes).optional(),
});

/**
 * Parse the editor's pipe-delimited free text into validated constraints. One
 * constraint per line:
 *
 *   `<scope> | <target> | <rule> | <description>`
 *
 * `scope` must be one of {@link QUALITY_CONSTRAINT_SCOPES}; `target` is blank for
 * global scope; `rule` is required; `description` is optional. Blank lines and
 * lines that fail validation (unknown scope, empty rule) are skipped rather than
 * rejecting the whole edit — the admin sees only the constraints that round-trip.
 * Output is capped at {@link MAX_QUALITY_CONSTRAINTS}. Inverse of
 * {@link formatQualityConstraints}.
 */
export function parseQualityConstraints(raw: string): QualityConstraint[] {
  const out: QualityConstraint[] = [];
  for (const line of raw.split('\n')) {
    if (out.length >= MAX_QUALITY_CONSTRAINTS) break;
    if (!line.trim()) continue;
    const [scopeRaw = '', targetRaw = '', ruleRaw = '', ...rest] = line.split('|');
    const candidate = {
      scope: scopeRaw.trim().toLowerCase(),
      target: targetRaw.trim() || undefined,
      rule: ruleRaw.trim(),
      // Re-join any extra pipes into the description so descriptions can contain '|'.
      description: rest.join('|').trim() || undefined,
    };
    const parsed = qualityConstraintSchema.safeParse(candidate);
    if (!parsed.success) continue;
    // A global constraint carries no target.
    if (parsed.data.scope === 'global') delete parsed.data.target;
    out.push(parsed.data);
  }
  return out;
}

/** Render stored constraints back to editable pipe-delimited lines. */
export function formatQualityConstraints(constraints: QualityConstraint[]): string {
  return constraints
    .map((c) => [c.scope, c.target ?? '', c.rule, c.description ?? ''].join(' | '))
    .join('\n');
}

/**
 * The Quality Standard editor form (raw inputs as the admin types them). The
 * action layer turns `constraints` into the stored JSONB via
 * {@link parseQualityConstraints}. Bounds the raw textarea (F8.5) generously —
 * the per-constraint fields are bounded again on parse.
 */
export const qualityStandardFormSchema = z.object({
  name: requiredText('Name the quality standard.'),
  constraints: z
    .string()
    .trim()
    .max(TEXT_LIMITS.briefFragment, `Keep it under ${TEXT_LIMITS.briefFragment} characters.`)
    .optional(),
});
export type QualityStandardForm = z.infer<typeof qualityStandardFormSchema>;
