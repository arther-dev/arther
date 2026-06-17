import { NextResponse } from 'next/server';
import { logMagicLinkAccess, validateMagicLink } from '@arther/db';
import {
  hashIp,
  hashMagicToken,
  PORTAL_SESSION_TTL_SECONDS,
  signPortalSession,
} from '@arther/config/magic-link';
import type { DocumentId } from '@arther/types';
import { getPortalDb } from '../../../lib/portal-db';

/**
 * C7.2 — the magic-link exchange. An access link (`?w=&d=&t=`) lands here; the
 * raw token is validated (hashed, looked up, checked for expiry/revocation), then
 * traded for a 24-hour HMAC-signed session cookie and the visitor is redirected
 * to the gated document page (the token never reaches the page or stays in the
 * URL). The access is logged (C7.5). A Route Handler — not the page — does this
 * because only handlers/actions may set cookies. Disabled until
 * `PORTAL_SESSION_SECRET` is set; the data path is the service client (the
 * visitor is anonymous), gated entirely by the token check here.
 */

const ACCESS_COOKIE = 'arther_portal_access';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const w = url.searchParams.get('w') ?? '';
  const d = url.searchParams.get('d') ?? '';
  const t = url.searchParams.get('t') ?? '';

  const gate = (denied: string) =>
    NextResponse.redirect(
      new URL(`/${encodeURIComponent(w)}/access?d=${encodeURIComponent(d)}&denied=${denied}`, url.origin),
    );

  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) return gate('disabled');
  if (!UUID_RE.test(d) || !t) return gate('invalid');

  const db = getPortalDb();
  if (!db) return gate('disabled');

  const link = await validateMagicLink(db, {
    documentId: d as DocumentId,
    tokenHash: hashMagicToken(t),
  });
  if (!link) return gate('invalid');

  // C7.5 — record the access (best-effort; logging never blocks entry).
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  try {
    await logMagicLinkAccess(db, {
      workspaceId: link.workspaceId,
      magicLinkId: link.id,
      documentId: link.documentId,
      ipHash: hashIp(ip, secret),
    });
  } catch {
    // ignore
  }

  const exp = Math.floor(Date.now() / 1000) + PORTAL_SESSION_TTL_SECONDS;
  const session = signPortalSession({ d: link.documentId, m: link.id, exp }, secret);

  const response = NextResponse.redirect(
    new URL(`/${encodeURIComponent(w)}/access?d=${encodeURIComponent(d)}`, url.origin),
  );
  response.cookies.set(ACCESS_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PORTAL_SESSION_TTL_SECONDS,
  });
  return response;
}
