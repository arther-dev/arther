import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * G2.1 — generation pre-flight (AI Document Generator spec §5.1), unprovisioned
 * baseline: the full-canvas pre-flight renders with the top bar and an honest
 * not-provisioned notice. The completeness report + confirm (which queue a run)
 * are covered by unit tests + DB probes until the provisioned-E2E environment
 * exists.
 */
test.describe('generation pre-flight', () => {
  test('renders the pre-flight and degrades honestly while unprovisioned', async ({ page }) => {
    await page.goto(`${APP}/specs/generate`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Generate a document' }),
    ).toBeVisible();
    await expect(
      page.getByText('Not configured in this environment yet', { exact: false }),
    ).toBeVisible();
  });

  test('keeps the top bar (full-canvas hides the rail, not the bar)', async ({ page }) => {
    await page.goto(`${APP}/specs/generate`);
    await expect(page.getByRole('banner')).toBeVisible();
  });
});
