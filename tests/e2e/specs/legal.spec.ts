import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

// Public legal pages (launch-readiness gate). They're static (no Supabase), so
// they render fully even in the unprovisioned baseline.
test.describe('legal pages', () => {
  test('/privacy renders its heading and links to /terms', async ({ page }) => {
    const res = await page.goto(`${APP}/privacy`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /terms of service/i })).toBeVisible();
  });

  test('/terms renders its heading and links to /privacy', async ({ page }) => {
    const res = await page.goto(`${APP}/terms`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1, name: /terms of service/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /privacy policy/i })).toBeVisible();
  });

  test('signup links to the terms and privacy pages', async ({ page }) => {
    const res = await page.goto(`${APP}/signup`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/terms',
    );
    await expect(page.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
