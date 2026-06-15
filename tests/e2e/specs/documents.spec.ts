import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

/**
 * G4.4 — read-only document view, unprovisioned baseline: the shared
 * block-renderer surface renders with the top bar and an honest preview state.
 * Rendering real Drafts is covered by the block-renderer unit tests (the
 * provisioned-E2E environment doesn't exist yet).
 */
test.describe('document view', () => {
  test('renders the document preview baseline while unprovisioned', async ({ page }) => {
    await page.goto(`${APP}/documents/${FAKE_ID}`);
    await expect(page.getByText('Document preview')).toBeVisible();
  });

  test('keeps the top bar', async ({ page }) => {
    await page.goto(`${APP}/documents/${FAKE_ID}`);
    await expect(page.getByRole('banner')).toBeVisible();
  });
});
