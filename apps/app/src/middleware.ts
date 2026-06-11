import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const AUTH_PATHS = ['/login', '/signup', '/forgot', '/reset', '/invite'];

/**
 * Session refresh + routing (F2.3, auth IA §4): unauthenticated users are
 * routed to /login for shell routes; authenticated users skip the auth
 * surfaces. Env-gated: until Supabase is provisioned, requests pass through
 * untouched so local/E2E runs exercise every surface without credentials.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
    return NextResponse.redirect(redirect);
  }
  if (user && (path === '/login' || path === '/signup')) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }
  return response;
}

export const config = {
  // Everything except static assets and Sentry's diagnostics route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sentry-check|.*\\.(?:svg|png|ico)$).*)'],
};
