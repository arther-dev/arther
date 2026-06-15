import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.1 Document Types settings — unprovisioned baseline: the surface renders its
 * first-run frame within the app shell. The fork/create/archive lifecycle runs
 * as DB probes in tests/db/document-types.test.ts until the provisioned-E2E
 * environment lands (same pattern as settings.spec.ts).
 */
test.describe('document types settings', () => {
  test('document types page renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings/document-types`);
    await expect(page.getByRole('heading', { name: 'Document types' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
  });
});
