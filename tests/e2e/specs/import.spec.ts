import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * F7 — Import / Re-import (Handoff 04 §B), unprovisioned baseline: the
 * full-canvas stepper flow renders with the top bar, the five-step
 * indicator, the dropzone, and an honest not-provisioned notice. Data-bearing
 * flows (interpret → review → commit) are covered by unit tests + DB probes
 * until the provisioned-E2E environment exists.
 */

test.describe('spec import stepper', () => {
  test('renders the upload step with the five-step indicator', async ({ page }) => {
    await page.goto(`${APP}/specs/import`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Import a spec sheet' }),
    ).toBeVisible();
    const steps = page.getByRole('navigation', { name: 'Import steps' });
    for (const label of ['Upload', 'Structural review', 'Field review', 'Validation', 'Commit']) {
      await expect(steps.getByText(label)).toBeVisible();
    }
    // Upload is the current step.
    await expect(steps.locator('[aria-current="step"]')).toHaveText('Upload');
  });

  test('keeps the top bar (full-canvas mode hides rail, not the bar)', async ({ page }) => {
    await page.goto(`${APP}/specs/import`);
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('shows the dropzone and degrades honestly while unprovisioned', async ({ page }) => {
    await page.goto(`${APP}/specs/import`);
    await expect(page.getByLabel('Spec sheet (.xlsx or .csv)')).toBeVisible();
    await expect(page.getByText('Not configured in this environment yet', { exact: false }))
      .toBeVisible();
  });

  test('the Specs empty state links into the import flow', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    const link = page.getByRole('link', { name: 'Import spreadsheet' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(`${APP}/specs/import`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Import a spec sheet' }),
    ).toBeVisible();
  });
});
