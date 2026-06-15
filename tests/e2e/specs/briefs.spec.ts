import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.6 Product Brief surface — unprovisioned baseline (no Supabase env in the
 * E2E harness): the Specs surface renders its first-run frame and a malformed
 * brief param never 500s. Data-bearing brief editing runs as DB probes in
 * tests/db/briefs.test.ts until the provisioned-E2E environment lands (§8.6).
 */
test.describe('product brief surface', () => {
  test('the specs surface renders its first-run frame', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    await expect(page.getByRole('heading', { name: 'No products yet' })).toBeVisible();
  });

  test('the brief tab + a malformed fragment param never 500', async ({ page }) => {
    const res = await page.goto(`${APP}/specs?tab=brief&fragment=NOT_A_KEY%20oops`);
    // Unprovisioned short-circuits to the empty state before any data read; the
    // point is the route resolves rather than throwing on a bad param.
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'No products yet' })).toBeVisible();
  });

  test('a malformed component-brief path resolves on the library', async ({ page }) => {
    const res = await page.goto(`${APP}/specs/library?component=not-a-uuid&tab=brief`);
    expect(res?.status()).toBeLessThan(500);
  });
});
