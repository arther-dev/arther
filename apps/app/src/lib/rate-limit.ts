import { headers } from 'next/headers';
import { rateLimit, type RateLimitRule } from '@arther/config/rate-limit';

/**
 * Per-endpoint rate limits (F8.2). Buckets cover the abuse-prone surfaces the
 * standing gate calls out (PLAN §8.4): authentication, invitations, and import
 * (which spends Anthropic tokens per run). Limits are deliberately generous —
 * this is brute-force / runaway-cost protection, not a usage quota — and tunable
 * here in one place. Pre-auth flows key on IP; authenticated flows on user id.
 */
const RULES = {
  'auth:signin': { limit: 10, windowSeconds: 60 },
  'auth:signup': { limit: 5, windowSeconds: 60 },
  'auth:reset': { limit: 5, windowSeconds: 60 },
  'auth:oauth': { limit: 20, windowSeconds: 60 },
  'auth:invite-accept': { limit: 20, windowSeconds: 60 },
  'invite:create': { limit: 20, windowSeconds: 300 },
  'import:run': { limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RULES;

/** Best-effort client IP from the proxy chain; key for pre-auth limits. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}

function humanize(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/**
 * Count one request against `bucket` for `identifier`. Returns null when the
 * request is permitted, or a user-facing message when the limit is hit — the
 * caller returns it in its action's error state (no enumeration: the message
 * is identical regardless of whether the underlying account/resource exists).
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<string | null> {
  const result = await rateLimit(bucket, identifier, RULES[bucket]);
  if (result.ok) return null;
  return `Too many attempts. Please wait ${humanize(result.retryAfterSeconds)} and try again.`;
}
