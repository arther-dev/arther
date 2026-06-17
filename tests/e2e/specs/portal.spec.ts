import { expect, test } from '@playwright/test';

const PORTAL = 'http://localhost:3001';
const UUID = '11111111-1111-1111-1111-111111111111';

test.describe('public portal (C6)', () => {
  test('serves the light-theme portal root', async ({ page }) => {
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

  test('the workspace home degrades gracefully when unprovisioned', async ({ page }) => {
    await page.goto(`${PORTAL}/acme`);
    // No Supabase env in the E2E build → a graceful message, never a 500.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/provisioned|not found|no portal/i)).toBeVisible();
  });

  test('a document URL server-renders without crashing (no JS)', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const res = await page.goto(`${PORTAL}/acme/${UUID}/install-guide`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await context.close();
  });
});
