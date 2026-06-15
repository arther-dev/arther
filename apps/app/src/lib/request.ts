import { headers } from 'next/headers';

/**
 * Best-effort client IP from the proxied request, for rate-limiting the
 * unauthenticated auth surfaces (F8.2). Behind Vercel the real client is the
 * first hop of `x-forwarded-for`; `x-real-ip` is a fallback. An absent IP
 * collapses to a shared bucket — conservative (one budget for all such
 * requests) rather than unlimited.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? 'unknown';
}
