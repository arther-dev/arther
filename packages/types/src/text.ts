import { z } from 'zod';

/**
 * F8.5 input-validation sweep — upper bounds for untrusted free text.
 *
 * Every name/notes/comment column in the schema is unbounded `text`, and the
 * action schemas historically used `.min(1)` with no ceiling. These caps stop
 * a caller persisting megabytes through any server-action boundary (storage
 * abuse, oversized AI prompts, UI blow-ups) while staying generous enough never
 * to bite a real spec name, release note, or comment. One source for the limits
 * (ADR-012: schemas are the single source) so every boundary agrees.
 */
export const TEXT_LIMITS = {
  /** Product / component / field / workspace / release names; categories. */
  name: 200,
  category: 200,
  /** Release tag, e.g. "v2.1". */
  tag: 64,
  /** Release notes and similar short prose. */
  notes: 4_000,
  /** Field comment bodies (rich text). */
  comment: 10_000,
  /** RFC 5321 maximum email length. */
  email: 320,
  /** Generous password ceiling (Supabase/bcrypt truncate far below this). */
  password: 200,
  /** Raw enum-options string before it is split on commas. */
  options: 4_000,
} as const;

/** Required, trimmed free text with a sane upper bound (default: name length). */
export function requiredText(requiredMessage: string, max: number = TEXT_LIMITS.name) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(max, `Keep it under ${max} characters.`);
}

/** Optional, trimmed free text with an upper bound (empty allowed → undefined). */
export function optionalText(max: number = TEXT_LIMITS.notes) {
  return z.string().trim().max(max, `Keep it under ${max} characters.`).optional();
}

/** Email with the RFC length ceiling applied alongside format validation. */
export function emailField(message = 'Enter a valid email address.') {
  return z.string().trim().max(TEXT_LIMITS.email, message).email(message);
}
