import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G0.3 approval-roles admin surface — unprovisioned baseline. The roles editor
 * lives inside a workspace Document Type's detail page (a `?type=<id>` view that
 * needs a provisioned workspace to reach), so the honest pre-provisioning check
 * is that its host surface renders its first-run frame. Role/assignment CRUD and
 * RLS run as DB probes in tests/db/approval-roles.test.ts until the
 * provisioned-E2E environment lands.
 */
test.describe('approval roles config', () => {
  test('renders the host document-types surface unprovisioned baseline', async ({ page }) => {
    await page.goto(`${APP}/settings/document-types`);
    await expect(page.getByRole('heading', { name: 'Document types' })).toBeVisible();
    await expect(page.getByText(/once the environment is provisioned/i)).toBeVisible();
    await expect(page.locator('.ui-tab-chip--active')).toHaveText('Settings');
  });
});
