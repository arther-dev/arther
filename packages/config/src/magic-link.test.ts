import { describe, expect, it } from 'vitest';
import {
  generateMagicToken,
  hashIp,
  hashMagicToken,
  signPortalSession,
  verifyPortalSession,
  type PortalSession,
} from './magic-link';

const SECRET = 'test-portal-secret-please-rotate';

describe('magic-link tokens (C7.2)', () => {
  it('generates a high-entropy, URL-safe token and a stable hash', () => {
    const a = generateMagicToken();
    const b = generateMagicToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(hashMagicToken(a)).toBe(hashMagicToken(a)); // deterministic
    expect(hashMagicToken(a)).not.toBe(hashMagicToken(b));
    expect(hashMagicToken(a)).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
  });
});

describe('portal sessions (C7.2)', () => {
  const future = (): PortalSession => ({ d: 'doc-1', m: 'ml-1', exp: Math.floor(Date.now() / 1000) + 3600 });

  it('round-trips a valid session', () => {
    const token = signPortalSession(future(), SECRET);
    const verified = verifyPortalSession(token, SECRET);
    expect(verified?.d).toBe('doc-1');
    expect(verified?.m).toBe('ml-1');
  });

  it('rejects a tampered payload', () => {
    const token = signPortalSession(future(), SECRET);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ d: 'other-doc', m: 'ml-1', exp: future().exp })).toString(
      'base64url',
    );
    expect(verifyPortalSession(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(body).toBeTruthy();
  });

  it('rejects a wrong-secret signature', () => {
    const token = signPortalSession(future(), SECRET);
    expect(verifyPortalSession(token, 'a-different-secret')).toBeNull();
  });

  it('rejects an expired session', () => {
    const expired: PortalSession = { d: 'doc-1', m: 'ml-1', exp: Math.floor(Date.now() / 1000) - 1 };
    expect(verifyPortalSession(signPortalSession(expired, SECRET), SECRET)).toBeNull();
  });

  it('rejects malformed cookies', () => {
    expect(verifyPortalSession(undefined, SECRET)).toBeNull();
    expect(verifyPortalSession('', SECRET)).toBeNull();
    expect(verifyPortalSession('no-dot', SECRET)).toBeNull();
    expect(verifyPortalSession('.sig', SECRET)).toBeNull();
  });
});

describe('hashIp', () => {
  it('hashes deterministically and never returns the raw IP', () => {
    expect(hashIp(null, SECRET)).toBeNull();
    expect(hashIp('203.0.113.7', SECRET)).toBe(hashIp('203.0.113.7', SECRET));
    expect(hashIp('203.0.113.7', SECRET)).not.toContain('203.0.113.7');
    expect(hashIp('203.0.113.7', SECRET)).not.toBe(hashIp('203.0.113.8', SECRET));
  });
});
