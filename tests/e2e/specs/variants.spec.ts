import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * V — Product Variants — unprovisioned baseline (§8.6). The variant CRUD, the
 * delta model, and the resolved-spec computation run as DB probes + unit tests
 * (tests/db/variants.test.ts, packages/types variant + variant-resolution specs)
 * until the provisioned-E2E environment lands; here we assert the surfaces render
 * their first-run frame and a malformed id degrades to "not found", never a 500.
 */
test.describe('product variants', () => {
  test('the variants management surface renders its baseline', async ({ page }) => {
    await page.goto(`${APP}/specs/variants`);
    await expect(page.getByRole('heading', { name: 'Variants' })).toBeVisible();
  });

  test('a malformed variant id renders the not-found baseline, never a 500', async ({ page }) => {
    const response = await page.goto(`${APP}/specs/variants/not-a-uuid`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Variant', exact: true })).toBeVisible();
  });
});
