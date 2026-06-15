import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@arther/ai-gateway',
    '@arther/authz',
    '@arther/config',
    '@arther/db',
    '@arther/rate-limit',
    '@arther/spec-import',
    '@arther/types',
    '@arther/ui',
  ],
  // Spreadsheet uploads go through a server action (F7.1); spec workbooks
  // are routinely a few MB.
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
};

// Source-map upload activates only when SENTRY_AUTH_TOKEN/ORG/PROJECT exist
// (CI/Vercel); local builds stay untouched.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
