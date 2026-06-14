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

export type RateLimitName = 'auth' | 'invitation' | 'import';

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
};

/** Both REST keys present ⇒ Upstash is the shared store; otherwise in-memory. */
export function isRateLimitProvisioned(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

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

  constructor(
    private readonly config: Record<RateLimitName, LimitConfig> = RATE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  check(name: RateLimitName, identifier: string): RateLimitResult {
    const c = this.config[name];
    const windowMs = c.windowSeconds * 1000;
    const t = this.now();
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
