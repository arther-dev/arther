import * as Sentry from '@sentry/nextjs';

/**
 * Client-side Sentry (F0.4). The DSN is a public ingest key (not a secret) —
 * exposed via NEXT_PUBLIC_SENTRY_DSN by design; gated so this is a no-op
 * until provisioned. No PII: no replays, no default PII.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
