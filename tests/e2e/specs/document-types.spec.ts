import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.1 Document Types settings surface — unprovisioned baseline: the page
 * renders its first-run frame and stays under the Settings tab; the CRUD/fork
 * behaviour runs as DB probes in tests/db/document-types.test.ts until the
 * provisioned-E2E environment lands (the data-bearing precedent from F5/F6).
 */
test.describe('document types settings', () => {
  test('renders the unprovisioned baseline under the Settings tab', async ({ page }) => {
    await page.goto(`${APP}/settings/document-types`);
    await expect(page.getByRole('heading', { name: 'Document types' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
    await expect(page.locator('.ui-tab-chip--active')).toHaveText('Settings');
  });
});
