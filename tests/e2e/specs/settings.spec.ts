import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * F4.5 settings + account menu — unprovisioned baseline: the surface renders
 * its first-run frame; membership/invitation flows run as DB probes in
 * tests/db/membership.test.ts until the provisioned-E2E environment lands.
 */
test.describe('workspace settings + account menu', () => {
  test('the avatar opens the account menu and routes to Settings', async ({ page }) => {
    await page.goto(`${APP}/dashboard`);
    await page.getByLabel('Account').click();
    await expect(page.getByRole('menuitem', { name: 'Workspace settings' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
    await expect(page).toHaveURL(`${APP}/settings`);
    await expect(page.locator('.ui-tab-chip--active')).toHaveText('Settings');
  });

  test('settings renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings`);
    await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
  });

  test('an invalid invitation token still renders the honest dead-end', async ({ page }) => {
    await page.goto(`${APP}/invite/${crypto.randomUUID()}`);
    await expect(page.getByRole('heading', { name: /isn’t valid/ })).toBeVisible();
  });
});
