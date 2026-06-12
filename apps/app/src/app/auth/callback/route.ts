import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '../../../lib/supabase/server';

/**
 * PKCE code exchange (F2.3): every Supabase redirect — Google OAuth, email
 * confirmation, password recovery — lands here with ?code=, gets exchanged
 * for a session cookie, and continues to ?next=. Without this route the
 * middleware bounces the still-unauthenticated browser to /login and the
 * code is lost.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const rawNext = url.searchParams.get('next') ?? '/dashboard';
  // Same-origin paths only — never an open redirect.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (code) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
