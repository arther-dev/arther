import { describe, expect, it } from 'vitest';
import {
  isRateLimitProvisioned,
  MemoryRateLimiter,
  rateLimit,
  RATE_LIMITS,
  type RateLimitName,
} from './index';

/** A controllable clock so window expiry is deterministic, not wall-time. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('MemoryRateLimiter', () => {
  it('allows up to the limit, then blocks within the window', () => {
    const c = clock();
    const rl = new MemoryRateLimiter(RATE_LIMITS, c.now);
    const { limit } = RATE_LIMITS.import; // 5

    for (let i = 0; i < limit; i++) {
      const r = rl.check('import', 'user-1');
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(limit - 1 - i);
      expect(r.retryAfterSeconds).toBe(0);
    }

    const blocked = rl.check('import', 'user-1');
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMITS.import.windowSeconds);
  });

  it('frees up budget once the window slides past the oldest hit', () => {
    const c = clock();
    const rl = new MemoryRateLimiter(RATE_LIMITS, c.now);
    const name: RateLimitName = 'auth';
    const { limit, windowSeconds } = RATE_LIMITS[name];

    for (let i = 0; i < limit; i++) rl.check(name, 'ip-1');
    expect(rl.check(name, 'ip-1').success).toBe(false);

    // Just before the window fully elapses, still blocked.
    c.advance(windowSeconds * 1000 - 10);
    expect(rl.check(name, 'ip-1').success).toBe(false);

    // After the oldest hit ages out, one slot reopens.
    c.advance(20);
    expect(rl.check(name, 'ip-1').success).toBe(true);
  });

  it('keeps separate budgets per identifier and per limiter name', () => {
    const c = clock();
    const rl = new MemoryRateLimiter(RATE_LIMITS, c.now);
    for (let i = 0; i < RATE_LIMITS.import.limit; i++) rl.check('import', 'user-1');

    // A different user is unaffected.
    expect(rl.check('import', 'user-2').success).toBe(true);
    // A different limiter for the same key has its own budget.
    expect(rl.check('invitation', 'user-1').success).toBe(true);
  });
});

describe('rateLimit (integration, unprovisioned)', () => {
  it('reports Upstash unprovisioned without the REST keys', () => {
    expect(process.env.UPSTASH_REDIS_REST_URL).toBeFalsy();
    expect(isRateLimitProvisioned()).toBe(false);
  });

  it('falls back to the in-memory limiter and enforces the budget', async () => {
    const id = `vitest-${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < RATE_LIMITS.invitation.limit; i++) {
      expect((await rateLimit('invitation', id)).success).toBe(true);
    }
    const blocked = await rateLimit('invitation', id);
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
