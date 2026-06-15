import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServer } from '../../../lib/supabase/server';

/** PKCE exchange code: present, non-empty, and length-bounded (F8.5). */
const codeSchema = z.string().min(1).max(2048);

/** Post-exchange destination: a same-origin path only — never an open redirect. */
const nextSchema = z
  .string()
  .max(2048)
  .refine((v) => v.startsWith('/') && !v.startsWith('//'), 'relative path')
  .catch('/dashboard');

/**
 * PKCE code exchange (F2.3): every Supabase redirect — Google OAuth, email
 * confirmation, password recovery — lands here with ?code=, gets exchanged
 * for a session cookie, and continues to ?next=. Without this route the
 * middleware bounces the still-unauthenticated browser to /login and the
 * code is lost.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = codeSchema.safeParse(url.searchParams.get('code'));
  // Same-origin paths only — never an open redirect (schema .catch falls back).
  const next = nextSchema.parse(url.searchParams.get('next') ?? '/dashboard');

  if (code.success) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code.data);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
