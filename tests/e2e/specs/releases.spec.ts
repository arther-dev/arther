import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * F5.7 releases rail view — unprovisioned baseline (no Supabase env in the
 * E2E harness): the surface renders its first-run frame and the rail wires
 * /specs ↔ /specs/releases. Data-bearing flows (create/delete snapshots,
 * override editing) run as DB probes in tests/db/releases-overrides.test.ts
 * until the provisioned-E2E environment lands.
 */
test.describe('releases rail view', () => {
  test('the rail navigates to Releases and marks it current', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    const rail = page.getByRole('navigation', { name: 'Views' });
    await rail.getByRole('link', { name: 'Releases' }).click();
    await expect(page).toHaveURL(`${APP}/specs/releases`);
    await expect(rail.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('renders the empty state explaining what a release is', async ({ page }) => {
    await page.goto(`${APP}/specs/releases`);
    await expect(page.getByRole('heading', { name: 'No releases yet' })).toBeVisible();
    await expect(page.getByText('named snapshot', { exact: false })).toBeVisible();
  });

  test('release surface is keyboard-reachable from the rail', async ({ page }) => {
    await page.goto(`${APP}/specs/releases`);
    const products = page.getByRole('link', { name: 'Products' });
    await products.focus();
    await expect(products).toBeFocused();
  });
});
