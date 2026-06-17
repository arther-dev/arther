import { z } from 'zod';

/**
 * C7.1 — per-document access tiers, stored on `published_snapshots.access_config`
 * (jsonb, default `{"access":"public"}`; migration 0008). One pure source
 * (ADR-012) read by the portal (which gates serving) and the app (which sets the
 * tier + issues magic links).
 *
 * Slice 1 ships two tiers; `allowlist` (C7.3 — email/domain allowlisting) lands
 * next, so the schema is `passthrough()` to tolerate a future `allowlist` field
 * without breaking older readers, and any unrecognised `access` value falls back
 * to the safe default (public stays public; an unknown tier is treated as gated).
 *
 *   - `public` — anonymous; served on the public portal with no link.
 *   - `link`   — gated; requires a valid magic-link session (C7.2).
 */
export const DOCUMENT_ACCESS_MODES = ['public', 'link'] as const;
export type DocumentAccessMode = (typeof DOCUMENT_ACCESS_MODES)[number];

export const documentAccessConfigSchema = z
  .object({ access: z.enum(DOCUMENT_ACCESS_MODES).default('public') })
  .passthrough();

export type DocumentAccessConfig = z.infer<typeof documentAccessConfigSchema>;

/**
 * The access mode for a raw `access_config` value. Missing/empty → public (the
 * column default); a malformed object or unknown `access` → gated (`link`), so a
 * config we can't positively read as public is never served anonymously.
 */
export function parseDocumentAccess(raw: unknown): DocumentAccessMode {
  if (raw == null) return 'public';
  if (typeof raw !== 'object') return 'public';
  const access = (raw as { access?: unknown }).access;
  if (access === undefined || access === 'public') return 'public';
  return DOCUMENT_ACCESS_MODES.includes(access as DocumentAccessMode)
    ? (access as DocumentAccessMode)
    : 'link';
}

/** True only when the document is positively public (portal-visible anonymously). */
export function isPublicAccess(raw: unknown): boolean {
  return parseDocumentAccess(raw) === 'public';
}

/** The magic-link types (migration 0008 `magic_links.type` CHECK). */
export const MAGIC_LINK_TYPES = ['open', 'allowlist'] as const;
export type MagicLinkType = (typeof MAGIC_LINK_TYPES)[number];
