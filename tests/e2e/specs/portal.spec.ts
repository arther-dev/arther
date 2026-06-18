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

  test('portal search is a server-rendered GET form (C6.4)', async ({ browser }) => {
    // Shareable + works without JS: the form GETs ?q and the page renders results.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const res = await page.goto(`${PORTAL}/acme/search?q=voltage`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeVisible();
    await context.close();
  });

  test('a gated document shows the access gate, never content, without a session (C7)', async ({
    page,
  }) => {
    // No valid session cookie → the gate is shown, and no document is served.
    const res = await page.goto(`${PORTAL}/acme/access?d=${UUID}`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1, name: /access required/i })).toBeVisible();
    await expect(page.getByText(/access link/i)).toBeVisible();
  });

  test('the analytics beacon endpoint accepts a POST and answers 204 (C9.6)', async ({ request }) => {
    // The view beacon is fire-and-forget: /api/track always answers 204, even
    // unprovisioned (no Supabase in the E2E build) — it must never error or
    // return content. A bad/foreign body is ignored, still 204.
    const ok = await request.post(`${PORTAL}/api/track`, {
      data: { type: 'document_viewed', workspace: 'acme', product: UUID, document: 'install-guide' },
    });
    expect(ok.status()).toBe(204);
    const junk = await request.post(`${PORTAL}/api/track`, { data: { type: 'nonsense' } });
    expect(junk.status()).toBe(204);
  });

  test('robots.txt points at the sitemap and fences /api (C9.3)', async ({ page }) => {
    const res = await page.goto(`${PORTAL}/robots.txt`);
    expect(res?.status()).toBe(200);
    const body = await res!.text();
    expect(body).toContain('Sitemap:');
    expect(body).toMatch(/Disallow:\s*\/api\//);
  });

  test('sitemap.xml is served as a urlset (C9.3)', async ({ page }) => {
    const res = await page.goto(`${PORTAL}/sitemap.xml`);
    expect(res?.status()).toBe(200);
    expect(await res!.text()).toContain('<urlset');
  });

  test('a document URL carries a canonical link (C9.3)', async ({ page }) => {
    await page.goto(`${PORTAL}/acme/${UUID}/install-guide`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/acme\/.+\/install-guide$/,
    );
  });

  test('the access gate and search are noindex (C9.3)', async ({ page }) => {
    await page.goto(`${PORTAL}/acme/access?d=${UUID}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.goto(`${PORTAL}/acme/search?q=x`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
