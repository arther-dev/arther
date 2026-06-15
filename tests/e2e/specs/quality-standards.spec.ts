import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.5 Quality Standards — unprovisioned baseline (§8.6). The admin CRUD + the
 * referenced-delete guard run as DB probes in tests/db/quality-standards.test.ts
 * until the provisioned-E2E environment lands; here we assert the surface renders
 * its first-run frame and a malformed id degrades to "not found" (F8.5).
 */
test.describe('quality standards', () => {
  test('the list surface renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings/quality-standards`);
    await expect(page.getByRole('heading', { name: 'Quality standards' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
  });

  test('a malformed standard id renders the editor baseline, never a 500', async ({ page }) => {
    const response = await page.goto(`${APP}/settings/quality-standards/not-a-uuid`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Quality standard' })).toBeVisible();
  });
});
