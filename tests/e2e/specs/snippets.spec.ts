import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * R.1 Block library — unprovisioned baseline (§8.6). The editor CRUD + the
 * editor/viewer RLS split run as DB probes in tests/db/library.test.ts until the
 * provisioned-E2E environment lands; here we assert the surface renders its
 * first-run frame and a malformed id degrades to "not found", never a 500.
 */
test.describe('block library', () => {
  test('the library surface renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/snippets`);
    await expect(page.getByRole('heading', { name: 'Block library' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
  });

  test('a malformed library item id renders the not-found baseline, never a 500', async ({
    page,
  }) => {
    const response = await page.goto(`${APP}/snippets/not-a-uuid`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Library item' })).toBeVisible();
  });

  test('the content editor renders its unprovisioned baseline (R.2c)', async ({ page }) => {
    const response = await page.goto(`${APP}/snippets/not-a-uuid/edit`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Edit content' })).toBeVisible();
  });
});
