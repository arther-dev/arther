import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './screens/auth.setup';

/**
 * Visual-QA screenshot pass — separate from the smoke suite (playwright.config.ts).
 * Captures every static route (screens/routes.ts) at a fixed viewport for the
 * autonomous QA agent to review against the design spec.
 *
 * Targets the seeded staging app when ARTHER_STAGING_APP_URL is set; otherwise
 * spins up local production builds (same as the smoke suite). When QA creds are
 * present it logs in first (auth.setup.ts) so shell routes render authenticated.
 */
const useLocalServers = !process.env.ARTHER_STAGING_APP_URL;
const haveCreds = !!(process.env.ARTHER_QA_EMAIL && process.env.ARTHER_QA_PASSWORD);

export default defineConfig({
  testDir: './screens',
  testMatch: /capture\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'screenshots-report' }]],
  outputDir: './screenshots-trace',
  globalSetup: haveCreds ? './screens/auth.setup.ts' : undefined,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    ...(haveCreds ? { storageState: STORAGE_STATE } : {}),
  },
  webServer: useLocalServers
    ? [
        {
          command: 'pnpm --filter app start',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: 'pnpm --filter portal start',
          url: 'http://localhost:3001',
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ]
    : undefined,
});
