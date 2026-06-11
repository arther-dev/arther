import * as Sentry from '@sentry/nextjs';

/** Edge-runtime Sentry (middleware, edge routes). DSN-gated no-op until provisioned. */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
