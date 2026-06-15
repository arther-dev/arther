import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.1/G0.2 Document Types admin surface — unprovisioned baseline: the surface
 * renders its first-run frame; fork/section CRUD run as DB probes in
 * tests/db/document-types.test.ts until the provisioned-E2E environment lands.
 */
test.describe('document types config', () => {
  test('renders the unprovisioned baseline under Settings', async ({ page }) => {
    await page.goto(`${APP}/settings/document-types`);
    await expect(page.getByRole('heading', { name: 'Document types' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
    // It lives in the Settings mode (rail-less), so the active tab is Settings.
    await expect(page.locator('.ui-tab-chip--active')).toHaveText('Settings');
  });
});
