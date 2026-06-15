import { expect, test } from '@playwright/test';

/**
 * Security-headers gate (F8.3): both front doors must ship the baseline
 * security headers and a strict, nonce-based CSP on every response — proven
 * here against the production builds, not just unit-tested in isolation.
 */
const SURFACES = [
  { name: 'app', url: 'http://localhost:3000/login' },
  { name: 'portal', url: 'http://localhost:3001/' },
];

for (const surface of SURFACES) {
  test.describe(`${surface.name} security headers`, () => {
    test('sets the static security baseline', async ({ request }) => {
      const res = await request.get(surface.url);
      const headers = res.headers();
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['strict-transport-security']).toContain('includeSubDomains');
      expect(headers['permissions-policy']).toContain('geolocation=()');
    });

    test('sets a strict, nonce-based Content-Security-Policy', async ({ request }) => {
      const res = await request.get(surface.url);
      const csp = res.headers()['content-security-policy'];
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      // Production build → nonce + strict-dynamic, never unsafe-eval.
      expect(csp).toContain('strict-dynamic');
      expect(csp).toMatch(/'nonce-[a-f0-9]+'/);
      expect(csp).not.toContain('unsafe-eval');
    });

    test('issues a fresh CSP nonce per response', async ({ request }) => {
      const nonceOf = (csp: string | undefined) => csp?.match(/'nonce-([a-f0-9]+)'/)?.[1];
      const first = nonceOf((await request.get(surface.url)).headers()['content-security-policy']);
      const second = nonceOf((await request.get(surface.url)).headers()['content-security-policy']);
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(first).not.toBe(second);
    });
  });
}
