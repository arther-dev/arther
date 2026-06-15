import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.1 Document Types — unprovisioned baseline: the Settings → Document types
 * surface renders its first-run frame and is reachable from Settings. Built-in
 * forking, creation, and archive run as DB probes in tests/db/document-types.test.ts
 * until the provisioned-E2E environment lands.
 */
test.describe('document types', () => {
  test('Settings links through to Document types', async ({ page }) => {
    await page.goto(`${APP}/settings`);
    await expect(page.getByRole('link', { name: 'Document types' })).toBeVisible();
    await page.getByRole('link', { name: 'Document types' }).click();
    await expect(page).toHaveURL(`${APP}/settings/document-types`);
    await expect(page.locator('.ui-tab-chip--active')).toHaveText('Settings');
  });

  test('the document types surface renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings/document-types`);
    await expect(page.getByRole('heading', { name: 'Document types' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
  });
});
