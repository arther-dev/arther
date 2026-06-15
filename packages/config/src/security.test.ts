import { describe, expect, it } from 'vitest';
import {
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  generateCspNonce,
} from './security';

function directives(csp: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of csp.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    if (name) map.set(name, values.join(' '));
  }
  return map;
}

describe('buildContentSecurityPolicy', () => {
  it('carries the nonce and strict-dynamic in production script-src', () => {
    const d = directives(buildContentSecurityPolicy('abc123', { app: true }));
    expect(d.get('script-src')).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('relaxes script-src for the dev server (eval/inline HMR)', () => {
    const d = directives(buildContentSecurityPolicy('abc123', { app: true, isDev: true }));
    expect(d.get('script-src')).toContain("'unsafe-eval'");
    expect(d.get('script-src')).not.toContain('nonce');
  });

  it('locks down the dangerous directives regardless of profile', () => {
    const d = directives(buildContentSecurityPolicy('n', {}));
    expect(d.get('default-src')).toBe("'self'");
    expect(d.get('object-src')).toBe("'none'");
    expect(d.get('frame-ancestors')).toBe("'none'");
    expect(d.get('base-uri')).toBe("'self'");
  });

  it('grants the app Supabase + Sentry connect-src and Google form-action; the portal does not', () => {
    const app = directives(buildContentSecurityPolicy('n', { app: true }));
    expect(app.get('connect-src')).toContain('https://*.supabase.co');
    expect(app.get('connect-src')).toContain('https://*.ingest.us.sentry.io');
    expect(app.get('form-action')).toContain('https://accounts.google.com');

    const portal = directives(buildContentSecurityPolicy('n', { app: false }));
    expect(portal.get('connect-src')).toBe("'self'");
    expect(portal.get('form-action')).toBe("'self'");
  });

  it('upgrades insecure requests in production only', () => {
    expect(buildContentSecurityPolicy('n', {})).toContain('upgrade-insecure-requests');
    expect(buildContentSecurityPolicy('n', { isDev: true })).not.toContain('upgrade-insecure-requests');
  });
});

describe('STATIC_SECURITY_HEADERS', () => {
  it('denies framing and sniffing and pins a strong HSTS', () => {
    expect(STATIC_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(STATIC_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(STATIC_SECURITY_HEADERS['Strict-Transport-Security']).toContain('includeSubDomains');
  });
});

describe('generateCspNonce', () => {
  it('produces a unique, hyphen-free nonce per call', () => {
    const a = generateCspNonce();
    const b = generateCspNonce();
    expect(a).not.toBe(b);
    expect(a).not.toContain('-');
    expect(a.length).toBeGreaterThanOrEqual(16);
  });
});
