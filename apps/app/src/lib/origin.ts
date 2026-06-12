import { headers } from 'next/headers';

/**
 * Public origin of THIS deployment, read from the proxied request headers.
 *
 * Supabase auth redirects (OAuth, email confirmation, recovery) and invite
 * links must point back at the exact host the user is on — production, any
 * preview URL, or localhost. A single static `APP_URL` can't be right for
 * previews (their hostnames are generated per deploy), and if it's unset or
 * wrong GoTrue rejects the `redirect_to` and silently falls back to the Site
 * URL. Deriving from `x-forwarded-host` makes every environment correct;
 * `APP_URL` remains only as a last-resort fallback for non-request contexts.
 */
export async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  return process.env.APP_URL ?? 'http://localhost:3000';
}
