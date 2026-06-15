import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryBackend,
  createUpstashBackend,
  rateLimit,
  type RateLimitBackend,
} from './rate-limit';

const RULE = { limit: 3, windowSeconds: 60 } as const;

describe('rateLimit (in-memory)', () => {
  let backend: RateLimitBackend;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    backend = createInMemoryBackend();
  });
  afterEach(() => vi.useRealTimers());

  it('permits up to the limit, then blocks', async () => {
    for (let i = 1; i <= RULE.limit; i++) {
      const r = await rateLimit('auth:signin', '1.2.3.4', RULE, backend);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(RULE.limit - i);
      expect(r.retryAfterSeconds).toBe(0);
    }
    const blocked = await rateLimit('auth:signin', '1.2.3.4', RULE, backend);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('isolates identifiers and buckets', async () => {
    for (let i = 0; i < RULE.limit + 1; i++) {
      await rateLimit('auth:signin', 'attacker', RULE, backend);
    }
    // A different IP is unaffected by the attacker's exhausted window.
    expect((await rateLimit('auth:signin', 'someone-else', RULE, backend)).ok).toBe(true);
    // A different bucket for the same IP is a separate counter.
    expect((await rateLimit('invite:create', 'attacker', RULE, backend)).ok).toBe(true);
  });

  it('resets when the fixed window rolls over', async () => {
    for (let i = 0; i < RULE.limit + 1; i++) {
      await rateLimit('import:run', 'user-1', RULE, backend);
    }
    expect((await rateLimit('import:run', 'user-1', RULE, backend)).ok).toBe(false);
    vi.advanceTimersByTime(RULE.windowSeconds * 1000);
    expect((await rateLimit('import:run', 'user-1', RULE, backend)).ok).toBe(true);
  });
});

describe('rateLimit (fail-open)', () => {
  it('allows the request when the backend throws', async () => {
    const flaky: RateLimitBackend = {
      increment: () => Promise.reject(new Error('redis down')),
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await rateLimit('auth:signin', '1.2.3.4', RULE, flaky);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(RULE.limit);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('createUpstashBackend', () => {
  afterEach(() => vi.restoreAllMocks());

  it('counts via the REST pipeline (INCR + PEXPIRE NX)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ result: 7 }, { result: 1 }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const backend = createUpstashBackend('https://redis.example', 'tok');
    const count = await backend.increment('rl:auth:signin:x', 60_000);

    expect(count).toBe(7);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://redis.example/pipeline');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual([
      ['INCR', 'rl:auth:signin:x'],
      ['PEXPIRE', 'rl:auth:signin:x', '60000', 'NX'],
    ]);
  });

  it('throws (so rateLimit fails open) on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const backend = createUpstashBackend('https://redis.example', 'tok');
    await expect(backend.increment('k', 1000)).rejects.toThrow('Upstash 500');
  });
});
