import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke suite — runs against PRODUCTION builds of both apps
 * (`next start`), the same artifacts CI just built. Part of the standing
 * verification gates (IMPLEMENTATION_PLAN.md §8): every surface that ships
 * gets at least a render/interaction smoke here.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
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
  ],
});
