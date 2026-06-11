import { expect, test } from '@playwright/test';

const PORTAL = 'http://localhost:3001';

test.describe('public portal stub', () => {
  test('serves the light-theme portal stub', async ({ page }) => {
    await page.goto(PORTAL);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('heading', { level: 1, name: 'Arther Portal' })).toBeVisible();
  });

  test('is server-rendered (readable without JavaScript)', async ({ browser }) => {
    // Portal invariant: published docs must be crawlable/readable without JS (C6.2).
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(PORTAL);
    await expect(page.getByRole('heading', { level: 1, name: 'Arther Portal' })).toBeVisible();
    await context.close();
  });
});
