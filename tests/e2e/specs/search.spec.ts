import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G4.7 — workspace search surface, unprovisioned baseline: the route renders the
 * search frame with a working GET form (so a query is shareable and works
 * without JS). Scoped results need provisioned data, covered by the
 * `searchWorkspace` DB probe + the `searchSnippet` unit tests.
 */
test.describe('workspace search', () => {
  test('renders the search box at the baseline', async ({ page }) => {
    await page.goto(`${APP}/search`);
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: /search the workspace/i })).toBeVisible();
  });

  test('a query is reflected from the URL (server-rendered GET form)', async ({ page }) => {
    await page.goto(`${APP}/search?q=voltage`);
    await expect(page.getByRole('searchbox', { name: /search the workspace/i })).toHaveValue(
      'voltage',
    );
  });
});
