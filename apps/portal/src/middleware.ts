import { NextResponse, type NextRequest } from 'next/server';
import { STATIC_SECURITY_HEADERS, buildCacheableCsp } from '@arther/config/security';

/**
 * Security headers for the public portal (F8.3 + C6.5). The portal serves
 * frozen, CDN-cacheable published documents and must stay readable without
 * JavaScript, so it carries a **static (nonce-free) CSP** — responses are
 * identical across requests and therefore cacheable (the per-request nonce CSP
 * the app uses forecloses caching). Every directive stays tight (default-src
 * 'self', object-src 'none', frame-ancestors 'none'); only `script-src` allows
 * Next's deterministic bootstrap via `'unsafe-inline'`, justified by the portal
 * rendering only React-escaped published content (see buildCacheableCsp).
 */
export function middleware(_request: NextRequest) {
  const csp = buildCacheableCsp({ isDev: process.env.NODE_ENV !== 'production' });
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)'],
};
