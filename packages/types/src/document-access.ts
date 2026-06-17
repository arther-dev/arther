import { z } from 'zod';

/**
 * C7.1/C7.3 — per-document access tiers, stored on
 * `published_snapshots.access_config` (jsonb, default `{"access":"public"}`;
 * migration 0008). One pure source (ADR-012) read by the portal (which gates
 * serving) and the app (which sets the tier + issues magic links).
 *
 * Three tiers:
 *   - `public`    — anonymous; served on the public portal with no link.
 *   - `link`      — gated; any holder of a valid magic-link session (C7.2).
 *   - `allowlist` — gated; only links issued to an allowlisted email/domain
 *                   validate (C7.3). The allowlist rides in `access_config`.
 *
 * The schema is `passthrough()` so unknown future fields don't break older
 * readers, and any unrecognised `access` value falls back to the safe default:
 * public stays public, but an unknown/garbled tier is treated as gated.
 */
export const DOCUMENT_ACCESS_MODES = ['public', 'link', 'allowlist'] as const;
export type DocumentAccessMode = (typeof DOCUMENT_ACCESS_MODES)[number];

export const allowlistSchema = z.object({
  emails: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
});
export type DocumentAllowlist = z.infer<typeof allowlistSchema>;

export const documentAccessConfigSchema = z
  .object({
    access: z.enum(DOCUMENT_ACCESS_MODES).default('public'),
    allowlist: allowlistSchema.optional(),
  })
  .passthrough();

export type DocumentAccessConfig = z.infer<typeof documentAccessConfigSchema>;

/**
 * The access mode for a raw `access_config`. Missing/empty → public (the column
 * default); a malformed object or unknown `access` → gated (`link`), so a config
 * we can't positively read as public is never served anonymously.
 */
export function parseDocumentAccess(raw: unknown): DocumentAccessMode {
  if (raw == null || typeof raw !== 'object') return 'public';
  const access = (raw as { access?: unknown }).access;
  if (access === undefined || access === 'public') return 'public';
  return DOCUMENT_ACCESS_MODES.includes(access as DocumentAccessMode)
    ? (access as DocumentAccessMode)
    : 'link';
}

/** The normalised allowlist for a config (empty when none configured). */
export function parseDocumentAllowlist(raw: unknown): DocumentAllowlist {
  if (raw == null || typeof raw !== 'object') return { emails: [], domains: [] };
  const parsed = allowlistSchema.safeParse((raw as { allowlist?: unknown }).allowlist ?? {});
  const value = parsed.success ? parsed.data : { emails: [], domains: [] };
  return {
    emails: normalizeEmails(value.emails),
    domains: normalizeDomains(value.domains),
  };
}

/** True only when the document is positively public (portal-visible anonymously). */
export function isPublicAccess(raw: unknown): boolean {
  return parseDocumentAccess(raw) === 'public';
}

/**
 * C7.3 — is `email` permitted by this `access_config`'s allowlist? Only meaningful
 * for the `allowlist` tier (returns false otherwise). An email matches when it is
 * listed exactly, or when its domain is listed. Empty allowlist admits no one
 * (fail closed). Case-insensitive; a leading `@` on a domain is tolerated.
 */
export function isEmailAllowed(raw: unknown, email: string): boolean {
  if (parseDocumentAccess(raw) !== 'allowlist') return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1) return false;
  const domain = e.slice(at + 1);
  const { emails, domains } = parseDocumentAllowlist(raw);
  return emails.includes(e) || domains.includes(domain);
}

/** Normalise a list of emails: trimmed, lowercased, de-duplicated, non-empty. */
export function normalizeEmails(values: readonly string[]): string[] {
  return dedupe(values.map((v) => v.trim().toLowerCase()).filter((v) => v.includes('@')));
}

/** Normalise a list of domains: trimmed, lowercased, leading `@` stripped, deduped. */
export function normalizeDomains(values: readonly string[]): string[] {
  return dedupe(
    values.map((v) => v.trim().toLowerCase().replace(/^@/, '')).filter((v) => v.includes('.')),
  );
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

/** The magic-link types (migration 0008 `magic_links.type` CHECK). */
export const MAGIC_LINK_TYPES = ['open', 'allowlist'] as const;
export type MagicLinkType = (typeof MAGIC_LINK_TYPES)[number];

/** The lifecycle status of an issued magic link (C7.4). */
export type MagicLinkStatus = 'active' | 'expired' | 'revoked';

/** Derive a link's status from its timestamps (pure; shared by db + UI). */
export function magicLinkStatus(input: {
  revokedAt: string | null;
  expiresAt: string;
  now?: number;
}): MagicLinkStatus {
  if (input.revokedAt) return 'revoked';
  const now = input.now ?? Date.now();
  return new Date(input.expiresAt).getTime() <= now ? 'expired' : 'active';
}
