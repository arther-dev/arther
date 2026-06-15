/**
 * Rate limiting (Phase 1 F8.2, ADR-014).
 *
 * A small fixed-window limiter with two backends behind one interface:
 *
 *   - in-memory (default)  — a per-instance Map; correct for local/dev and
 *     single-instance runs. On serverless this is best-effort (counters don't
 *     span instances), which is the documented dev fallback (PLAN §6).
 *   - Upstash Redis        — shared, durable counters across instances. Used
 *     the moment UPSTASH_REDIS_REST_URL/TOKEN are present, via the REST
 *     pipeline (INCR + PEXPIRE NX) — one fetch, no SDK, matching the Resend
 *     call-site pattern (ADR-011 ethos) and the env tiers in `env.ts`.
 *
 * Server-side only. This is defence-in-depth over `canDo` + RLS (ADR-010) —
 * not the authorization boundary — so it fails OPEN on backend errors: a
 * Redis outage must not lock users out of auth. Every block and every backend
 * error is logged.
 */

export interface RateLimitRule {
  /** Max requests permitted within the window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  /** True when the request is within the limit. */
  readonly ok: boolean;
  readonly limit: number;
  /** Requests still permitted in the current window (0 when blocked). */
  readonly remaining: number;
  /** Epoch ms at which the current window resets. */
  readonly resetAt: number;
  /** Seconds until the window resets (0 when ok) — for a Retry-After hint. */
  readonly retryAfterSeconds: number;
}

/** Pluggable counter store. Returns the post-increment count for `key`. */
export interface RateLimitBackend {
  increment(key: string, windowMs: number): Promise<number>;
}

// ── In-memory backend ───────────────────────────────────────────────────────

interface Counter {
  count: number;
  resetAt: number;
}

export function createInMemoryBackend(): RateLimitBackend {
  const store = new Map<string, Counter>();
  return {
    async increment(key, windowMs) {
      const now = Date.now();
      const existing = store.get(key);
      if (!existing || existing.resetAt <= now) {
        // Opportunistic sweep so the Map can't grow unbounded.
        if (store.size > 10_000) {
          for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
        }
        const fresh = { count: 1, resetAt: now + windowMs };
        store.set(key, fresh);
        return 1;
      }
      existing.count += 1;
      return existing.count;
    },
  };
}

// ── Upstash REST backend ─────────────────────────────────────────────────────

export function createUpstashBackend(url: string, token: string): RateLimitBackend {
  return {
    async increment(key, windowMs) {
      // Atomic per key: bump the counter, then set the TTL only if absent so
      // the window is anchored to the first hit, not extended on every call.
      const res = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['PEXPIRE', key, String(windowMs), 'NX'],
        ]),
      });
      if (!res.ok) throw new Error(`Upstash ${res.status}`);
      const body = (await res.json()) as Array<{ result?: number; error?: string }>;
      const incr = body[0];
      if (!incr || typeof incr.result !== 'number') {
        throw new Error(incr?.error ?? 'Upstash: malformed pipeline response');
      }
      return incr.result;
    },
  };
}

// ── Backend selection ────────────────────────────────────────────────────────

let cachedBackend: RateLimitBackend | undefined;

function defaultBackend(): RateLimitBackend {
  if (cachedBackend) return cachedBackend;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedBackend = url && token ? createUpstashBackend(url, token) : createInMemoryBackend();
  return cachedBackend;
}

/** Reset the memoised backend — for tests that toggle env between cases. */
export function __resetRateLimitBackend(): void {
  cachedBackend = undefined;
}

/**
 * Count one request against a fixed window for `bucket:identifier` and report
 * whether it is permitted. `bucket` namespaces the limit (e.g. `auth:signin`);
 * `identifier` is the subject (IP for pre-auth flows, user id once known).
 *
 * Fails open: if the backend throws, the request is allowed and the error is
 * logged — availability over strictness for this defence-in-depth control.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
  backend: RateLimitBackend = defaultBackend(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const key = `rl:${bucket}:${identifier}:${windowStart}`;

  let count: number;
  try {
    count = await backend.increment(key, windowMs);
  } catch (err) {
    console.error('[rate-limit] backend error — failing open', bucket, err);
    return { ok: true, limit: rule.limit, remaining: rule.limit, resetAt, retryAfterSeconds: 0 };
  }

  const ok = count <= rule.limit;
  if (!ok) {
    console.warn('[rate-limit] blocked', bucket, identifier, `${count}/${rule.limit}`);
  }
  return {
    ok,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt,
    retryAfterSeconds: ok ? 0 : Math.ceil((resetAt - now) / 1000),
  };
}
