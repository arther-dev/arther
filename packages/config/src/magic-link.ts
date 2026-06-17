import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * C7.2 — magic-link tokens + portal sessions. The token is a high-entropy random
 * secret handed to the recipient; only its SHA-256 hash is stored
 * (`magic_links.token_hash`), so a database leak never yields a usable link.
 * Validating a token mints a short-lived, HMAC-signed portal session (a cookie),
 * so the raw token leaves the URL after one exchange and the 24-hour session is
 * self-contained (revoking the link blocks new exchanges; live sessions run to
 * expiry — collaboration spec / C7.4). Server-only (node:crypto).
 */

/** 256 bits of entropy, URL-safe. The raw token is shown once and never stored. */
export function generateMagicToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The at-rest form of a token (`magic_links.token_hash`). Deterministic lookup. */
export function hashMagicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface PortalSession {
  /** The document the session grants access to. */
  d: string;
  /** The magic_link the session was minted from (for revocation auditing). */
  m: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const PORTAL_SESSION_TTL_SECONDS = 24 * 60 * 60;

/** `base64url(payload).hmacSHA256` — a stateless, tamper-evident session token. */
export function signPortalSession(payload: PortalSession, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Verify a session cookie: valid signature (constant-time) + not expired + the
 * shape we expect. Returns the payload, or null for anything we can't trust.
 */
export function verifyPortalSession(
  cookie: string | undefined | null,
  secret: string,
): PortalSession | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);

  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: PortalSession;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PortalSession;
  } catch {
    return null;
  }
  if (
    typeof payload?.d !== 'string' ||
    typeof payload?.m !== 'string' ||
    typeof payload?.exp !== 'number' ||
    payload.exp * 1000 <= Date.now()
  ) {
    return null;
  }
  return payload;
}

/** A coarse, non-reversible IP fingerprint for the access log (no raw PII). */
export function hashIp(ip: string | null | undefined, secret: string): string | null {
  if (!ip) return null;
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}
