import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

/**
 * G4.1 — the three-panel block editor shell, unprovisioned baseline: the editor
 * route renders with the top bar and an honest "opens once provisioned" state.
 * Selection / outline / panel-toggle interactions need document data, covered by
 * the block-renderer + outline unit tests until the provisioned-E2E env exists.
 */
test.describe('document editor shell', () => {
  test('renders the editor baseline while unprovisioned', async ({ page }) => {
    await page.goto(`${APP}/documents/${FAKE_ID}/edit`);
    await expect(page.getByText('Document editor')).toBeVisible();
  });

  test('keeps the top bar', async ({ page }) => {
    await page.goto(`${APP}/documents/${FAKE_ID}/edit`);
    await expect(page.getByRole('banner')).toBeVisible();
  });
});
