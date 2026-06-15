import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  generateCspNonce,
} from '@arther/config/security';

const AUTH_PATHS = ['/login', '/signup', '/forgot', '/reset', '/invite', '/auth'];

/** Stamp every response with the shared security headers + this request's CSP (F8.3). */
function withSecurityHeaders(response: NextResponse, csp: string): NextResponse {
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * Session refresh + routing (F2.3, auth IA §4) and security headers (F8.3).
 *
 * A per-request CSP nonce is injected into the request headers so Next's App
 * Router stamps it onto its inline bootstrap/streaming scripts; the same CSP
 * (plus the static header baseline) is set on every response we return —
 * redirects included.
 *
 * Env-gated for Supabase: until it is provisioned, requests pass through
 * untouched (still security-headed) so local/E2E runs exercise every surface
 * without credentials.
 */
export async function middleware(request: NextRequest) {
  const nonce = generateCspNonce();
  const csp = buildContentSecurityPolicy(nonce, {
    app: true,
    isDev: process.env.NODE_ENV !== 'production',
  });

  // Next reads the nonce from the request CSP header to nonce its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const nextWithNonce = () => NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return withSecurityHeaders(nextWithNonce(), csp);

  let response = nextWithNonce();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = nextWithNonce();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthSurface = AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isAuthSurface) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.search = '';
    return withSecurityHeaders(NextResponse.redirect(redirect), csp);
  }
  if (user && (path === '/login' || path === '/signup')) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    redirect.search = '';
    return withSecurityHeaders(NextResponse.redirect(redirect), csp);
  }
  return withSecurityHeaders(response, csp);
}

export const config = {
  // Everything except static assets and Sentry's diagnostics route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sentry-check|.*\\.(?:svg|png|ico)$).*)'],
};
