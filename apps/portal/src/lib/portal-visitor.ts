import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * C9.6 — the anonymous portal **visitor session**. Analytics events attribute
 * consumption to a `session_id` (never a user — portal visitors are anonymous),
 * so we mint a random, first-party, http-only id cookie. It is opaque (a UUID,
 * not an identifier), used only to deduplicate a single visitor's views/searches
 * in aggregate metrics. Set from Route Handlers / Server Actions only (a page
 * render may read it but cannot set cookies).
 */
const VISITOR_COOKIE = 'arther_portal_visitor';
// Long-lived but not permanent — a session for analytics, not a tracking profile.
const VISITOR_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

/** Read the visitor id if one is already set (render-safe; never sets a cookie). */
export async function readVisitorId(): Promise<string | null> {
  const store = await cookies();
  return store.get(VISITOR_COOKIE)?.value ?? null;
}

/**
 * Read the visitor id, minting and setting one when absent. Only valid in a
 * Route Handler or Server Action (where cookies may be written).
 */
export async function ensureVisitorId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: VISITOR_TTL_SECONDS,
  });
  return id;
}
