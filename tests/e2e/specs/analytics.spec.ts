import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * A.6 Admin consumption analytics — unprovisioned baseline (§8.6). The aggregate
 * RPCs + their RLS scoping run as DB probes in tests/db/workspace-analytics.test.ts
 * until the provisioned-E2E env lands; here we assert the admin surface renders
 * its first-run frame, never a 500.
 */
test.describe('workspace analytics', () => {
  test('the analytics surface renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings/analytics`);
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByText(/once the workspace is provisioned/i)).toBeVisible();
  });
});
