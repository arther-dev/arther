import { NextResponse, type NextRequest } from 'next/server';
import {
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  generateCspNonce,
} from '@arther/config/security';

/**
 * Security headers for the public portal (F8.3). The portal serves published,
 * cacheable documents and must stay readable without JavaScript (C6.2), so it
 * carries the tighter (non-app) CSP profile. The per-request nonce is injected
 * into the request headers for Next's bootstrap scripts and the CSP + static
 * baseline are set on the response.
 *
 * Note (revisit at C6): the nonce makes responses per-request and forecloses
 * full static optimisation of published-doc pages. The portal is a stub today;
 * when cached SSR published docs land, switch to a hash-based CSP so pages stay
 * cacheable while keeping the strict policy.
 */
export function middleware(request: NextRequest) {
  const nonce = generateCspNonce();
  const csp = buildContentSecurityPolicy(nonce, {
    app: false,
    isDev: process.env.NODE_ENV !== 'production',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)'],
};
