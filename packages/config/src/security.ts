/**
 * Security headers (Phase 1 F8.3, launch-readiness gate).
 *
 * Framework-agnostic header *values* so `@arther/config` stays free of any
 * Next dependency; each app's middleware applies them to the response. Both
 * front doors (apps/app, apps/portal) ship the same baseline; the
 * Content-Security-Policy is per-request because it carries a nonce.
 *
 * The CSP is nonce-based with `strict-dynamic` — the modern strict profile
 * (Next App Router reads the nonce from the request CSP header and stamps it
 * onto its bootstrap/streaming scripts). `'self'` is kept as a CSP-Level-2
 * fallback for browsers that ignore `strict-dynamic`. In development we relax
 * `script-src` to allow the dev server's eval/inline HMR; production builds
 * (what CI and `next start` exercise) get the strict policy.
 */

export type CspOptions = {
  /**
   * The authenticated app talks to Supabase (auth/storage/realtime) and Sentry
   * and bounces through Google for OAuth; the portal is public and talks to
   * far less. Defaults to the tighter portal profile.
   */
  app?: boolean;
  /** Relax script-src for the Next dev server (eval/inline HMR). */
  isDev?: boolean;
};

/**
 * Static security headers shared by both apps. `frame-ancestors 'none'` in the
 * CSP is the modern equivalent of `X-Frame-Options`, but the legacy header is
 * kept for older browsers. HSTS is only honoured over HTTPS — harmless to send
 * over plain HTTP (local/E2E), enforced in production.
 */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Deny powerful features by default; opt surfaces back in if ever needed.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
};

/**
 * Build the per-request Content-Security-Policy string for the given nonce.
 * Directives are assembled in a deterministic order so the output is stable
 * and testable.
 */
export function buildContentSecurityPolicy(nonce: string, options: CspOptions = {}): string {
  const { app = false, isDev = false } = options;

  const scriptSrc = isDev
    ? // Dev: Next's HMR client uses eval + inline bootstrap.
      ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
    : // Prod: nonce + strict-dynamic; 'self' is the CSP2 fallback.
      ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];

  // The authenticated app reaches Supabase (REST + realtime websocket) and
  // streams errors to Sentry; the portal needs none of that client-side yet.
  const connectSrc = ["'self'"];
  if (app) {
    connectSrc.push(
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://*.sentry.io',
      'https://*.ingest.sentry.io',
      'https://*.ingest.us.sentry.io',
    );
  }

  // OAuth sign-in posts to the server action (self) which 3xx-redirects to
  // Google; the form-action grant keeps that navigation legal under CSP3.
  const formAction = app ? ["'self'", 'https://accounts.google.com'] : ["'self'"];

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['form-action', formAction],
    // Logos and (later) doc imagery live in Supabase Storage.
    ['img-src', ["'self'", 'data:', 'blob:', 'https://*.supabase.co']],
    ['font-src', ["'self'", 'data:']],
    // Style injection (styled-jsx / Tailwind layer) is low-risk; allow inline.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['script-src', scriptSrc],
    ['connect-src', connectSrc],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`);
  // Force HTTPS for any sub-resource in production.
  if (!isDev) policy.push('upgrade-insecure-requests');

  return policy.join('; ');
}

/** A short, URL-safe nonce for a single response's CSP. */
export function generateCspNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
