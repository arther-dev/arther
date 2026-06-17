import { expect, test } from '@playwright/test';

/**
 * Security-headers gate (F8.3 + C6.5). Both front doors ship the baseline
 * security headers and a tight CSP on every response, proven against the
 * production builds. The CSP profile differs by surface: the authenticated app
 * uses a strict per-request nonce + `strict-dynamic`; the public portal uses a
 * static (nonce-free) CSP so its published-doc responses are CDN-cacheable.
 */
const SURFACES = [
  { name: 'app', url: 'http://localhost:3000/login', cacheable: false },
  { name: 'portal', url: 'http://localhost:3001/', cacheable: true },
];

for (const surface of SURFACES) {
  test.describe(`${surface.name} security headers`, () => {
    test('sets the static security baseline', async ({ request }) => {
      const headers = (await request.get(surface.url)).headers();
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['strict-transport-security']).toContain('includeSubDomains');
      expect(headers['permissions-policy']).toContain('geolocation=()');
    });

    test('sets a tight Content-Security-Policy', async ({ request }) => {
      const csp = (await request.get(surface.url)).headers()['content-security-policy'];
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain('unsafe-eval'); // never in production

      if (surface.cacheable) {
        // C6.5 — static, nonce-free so responses are identical + cacheable.
        expect(csp).not.toMatch(/nonce-/);
        expect(csp).not.toContain('strict-dynamic');
      } else {
        expect(csp).toContain('strict-dynamic');
        expect(csp).toMatch(/'nonce-[a-f0-9]+'/);
      }
    });
  });
}

test('the app issues a fresh CSP nonce per response (the portal is cacheable)', async ({
  request,
}) => {
  const nonceOf = (csp: string | undefined) => csp?.match(/'nonce-([a-f0-9]+)'/)?.[1];
  const app = 'http://localhost:3000/login';
  const first = nonceOf((await request.get(app)).headers()['content-security-policy']);
  const second = nonceOf((await request.get(app)).headers()['content-security-policy']);
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(first).not.toBe(second);

  // The portal repeats the same (cacheable) CSP — no per-response nonce.
  const portal = 'http://localhost:3001/';
  const p1 = (await request.get(portal)).headers()['content-security-policy'];
  const p2 = (await request.get(portal)).headers()['content-security-policy'];
  expect(p1).toBe(p2);
});
