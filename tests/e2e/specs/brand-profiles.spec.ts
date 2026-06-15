import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.4 Brand Profiles — unprovisioned baseline (§8.6). The admin CRUD + default
 * toggle + archive logic run as DB probes in tests/db/brand-profiles.test.ts
 * until the provisioned-E2E environment lands; here we assert the surface renders
 * its first-run frame and a malformed id degrades to "not found" (F8.5).
 */
test.describe('brand profiles', () => {
  test('the list surface renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings/brand-profiles`);
    await expect(page.getByRole('heading', { name: 'Brand profiles' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
  });

  test('a malformed profile id renders the editor baseline, never a 500', async ({ page }) => {
    const response = await page.goto(`${APP}/settings/brand-profiles/not-a-uuid`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Brand profile' })).toBeVisible();
  });
});
