import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

test.describe('design tokens reference page', () => {
  test('renders the dark theme with the design-token page', async ({ page }) => {
    await page.goto(`${APP}/design-tokens`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { level: 1, name: 'Arther' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Surface ramp' })).toBeVisible();
    // The six-surface ramp from tokens.css renders.
    for (const surface of ['canvas', 'surface', 'panel', 'raised', 'active', 'inset']) {
      await expect(page.getByText(surface, { exact: true })).toBeVisible();
    }
  });

  test('renders the five status pills with visible labels (never color-only)', async ({ page }) => {
    await page.goto(`${APP}/design-tokens`);
    for (const status of ['live', 'stale', 'review', 'draft', 'unpublished']) {
      await expect(page.locator(`.ui-status-pill--${status}`)).toHaveText(status);
    }
  });

  test('button atoms are interactive and keyboard-focusable', async ({ page }) => {
    await page.goto(`${APP}/design-tokens`);
    const primary = page.getByRole('button', { name: 'Primary' });
    await expect(primary).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Disabled' })).toBeDisabled();
    // :focus-visible ring is the a11y spec (Handoff 01 §10.4) — reachable by keyboard.
    await primary.focus();
    await expect(primary).toBeFocused();
  });
});
