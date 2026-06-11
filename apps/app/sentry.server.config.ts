import * as Sentry from '@sentry/nextjs';

/**
 * Server-side Sentry (F0.4). DSN-gated: a no-op until SENTRY_DSN is set.
 * PII scrubbing on per vibecode-best-practices: no default PII, no request
 * bodies/headers beyond Sentry's safe set, and spec values never logged.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
  });
}
