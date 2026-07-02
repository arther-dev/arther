import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * The small internal rate-limit module (ADR-014, Phase 1 F8.2).
 *
 * Upstash Redis sliding windows protect the abuse-prone surfaces — auth
 * (brute force / signup spam), invitations (email spam), and import (the
 * cost-bearing AI call). The store is never authoritative: with Upstash
 * unprovisioned (dev/CI) or briefly unreachable, the module degrades to a
 * per-instance in-memory limiter rather than failing open or locking users
 * out — correct with Redis down, just not cross-instance (plan §6).
 *
 * Provisioning is detected from the environment the same way Resend is
 * (process.env presence); both Upstash REST keys must be set to use Redis.
 */

export type RateLimitName =
  | 'auth'
  | 'invitation'
  | 'import'
  | 'generation'
  | 'assistant'
  | 'magic_link_issue'
  | 'magic_link_access'
  | 'portal_track';

export interface RateLimitResult {
  /** True when the request is within budget and may proceed. */
  success: boolean;
  /** The window's maximum request count. */
  limit: number;
  /** Requests left in the current window after this one. */
  remaining: number;
  /** Epoch ms when the window resets / the next token frees up. */
  reset: number;
  /** Whole seconds to wait before retrying; 0 when allowed. */
  retryAfterSeconds: number;
}

interface LimitConfig {
  limit: number;
  windowSeconds: number;
}

/**
 * Sliding-window budgets — generous enough for honest retries, tight enough
 * to blunt brute force, spam, and runaway AI cost. Tuned per concern (F8.2);
 * the same windows feed the Upstash and in-memory paths so behavior matches.
 */
export const RATE_LIMITS: Record<RateLimitName, LimitConfig> = {
  // Login / signup / reset / OAuth, keyed by client IP.
  auth: { limit: 10, windowSeconds: 60 },
  // Workspace invitations, keyed by the inviting member.
  invitation: { limit: 20, windowSeconds: 60 },
  // AI-backed spreadsheet interpretation, keyed by the importing member.
  import: { limit: 5, windowSeconds: 60 },
  // Document generation + block regeneration (paid AI calls), keyed by member.
  generation: { limit: 10, windowSeconds: 60 },
  // K/H.5 — Ask Arther chat + action execution (each turn is a paid AI call),
  // keyed by member. Generous for honest conversation, tight enough to blunt
  // an automated client running up token cost.
  assistant: { limit: 20, windowSeconds: 60 },
  // C9.4 — issuing portal magic links, keyed by the issuing member (anti-spam).
  magic_link_issue: { limit: 30, windowSeconds: 60 },
  // C9.4 — anonymous magic-link exchange at the portal, keyed by client IP
  // (blunts token probing; a legitimate visitor exchanges a link once).
  magic_link_access: { limit: 15, windowSeconds: 60 },
  // C9.6 — anonymous portal analytics beacons (view/search), keyed by client IP.
  // Generous (a visitor browsing fires one per page) but caps event-spam floods.
  portal_track: { limit: 60, windowSeconds: 60 },
};

function retryAfter(reset: number, now: number): number {
  return Math.max(1, Math.ceil((reset - now) / 1000));
}

/**
 * Per-instance sliding-log limiter — the fallback when Upstash is absent or
 * unreachable. Accurate within one process; deliberately not cross-instance
 * (that is what Redis is for). `now` is injectable for deterministic tests.
 */
export class MemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private checksSinceSweep = 0;

  constructor(
    private readonly config: Record<RateLimitName, LimitConfig> = RATE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Drop keys idle past their window so the map can't grow unbounded. */
  private sweep(t: number): void {
    for (const [key, stamps] of this.hits) {
      const name = key.slice(0, key.indexOf(':')) as RateLimitName;
      const windowMs = (this.config[name]?.windowSeconds ?? 60) * 1000;
      const newest = stamps[stamps.length - 1];
      if (newest === undefined || newest <= t - windowMs) this.hits.delete(key);
    }
  }

  check(name: RateLimitName, identifier: string): RateLimitResult {
    const c = this.config[name];
    const windowMs = c.windowSeconds * 1000;
    const t = this.now();
    if (++this.checksSinceSweep >= 1000) {
      this.checksSinceSweep = 0;
      this.sweep(t);
    }
    const key = `${name}:${identifier}`;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > t - windowMs);

    if (recent.length >= c.limit) {
      this.hits.set(key, recent);
      const reset = recent[0]! + windowMs;
      return { success: false, limit: c.limit, remaining: 0, reset, retryAfterSeconds: retryAfter(reset, t) };
    }

    recent.push(t);
    this.hits.set(key, recent);
    return {
      success: true,
      limit: c.limit,
      remaining: c.limit - recent.length,
      reset: t + windowMs,
      retryAfterSeconds: 0,
    };
  }
}

// Module-scoped state — resolved once per warm function instance so a single
// Redis client and limiter are reused across requests.
const memory = new MemoryRateLimiter();
let redis: Redis | null | undefined; // undefined = not yet resolved
const upstashLimiters = new Map<RateLimitName, Ratelimit>();

function upstashLimiterFor(name: RateLimitName): Ratelimit | null {
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = url && token ? new Redis({ url, token }) : null;
  }
  if (redis === null) return null;

  let limiter = upstashLimiters.get(name);
  if (!limiter) {
    const c = RATE_LIMITS[name];
    limiter = new Ratelimit({
      redis,
      prefix: `ratelimit:${name}`,
      limiter: Ratelimit.slidingWindow(c.limit, `${c.windowSeconds} s`),
      // Bound the request's wait on Redis; a slow store must not stall a login.
      timeout: 1500,
    });
    upstashLimiters.set(name, limiter);
  }
  return limiter;
}

/**
 * Consume one token from the named limiter for `identifier` (an IP for auth,
 * a user id for invitation/import). Returns whether the caller may proceed.
 */
export async function rateLimit(name: RateLimitName, identifier: string): Promise<RateLimitResult> {
  const limiter = upstashLimiterFor(name);
  if (!limiter) return memory.check(name, identifier);

  try {
    const res = await limiter.limit(identifier);
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
      retryAfterSeconds: res.success ? 0 : retryAfter(res.reset, Date.now()),
    };
  } catch {
    // Redis hiccup: degrade to per-instance limiting rather than fail fully
    // open or lock users out (ADR-014 — correct, slower, with Redis down).
    return memory.check(name, identifier);
  }
}
