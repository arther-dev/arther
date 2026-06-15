import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.1/G0.2 Document Types — unprovisioned baseline: the admin Settings surface
 * renders its first-run frame and breadcrumb. Fork/section editing run as DB
 * probes in tests/db/document-types.test.ts until the provisioned-E2E
 * environment lands (same pattern as settings.spec.ts).
 */
test.describe('document types', () => {
  test('the Document Types surface renders the unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings/document-types`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Document Types', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
  });

  test('it links back to Workspace settings', async ({ page }) => {
    await page.goto(`${APP}/settings/document-types`);
    await expect(page.getByRole('link', { name: /Workspace settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});
