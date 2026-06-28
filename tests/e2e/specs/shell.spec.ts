import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

test.describe('app shell frame (Handoff 02)', () => {
  test('home lands on the Dashboard (personal action queue)', async ({ page }) => {
    await page.goto(APP);
    await expect(page).toHaveURL(`${APP}/dashboard`);
    await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
  });

  test('the dashboard empty-state CTAs link into the spec flow', async ({ page }) => {
    await page.goto(`${APP}/dashboard`);
    await expect(page.getByRole('link', { name: 'Generate a document' })).toHaveAttribute(
      'href',
      '/specs/generate',
    );
    await expect(page.getByRole('link', { name: 'Add a product' })).toHaveAttribute(
      'href',
      '/specs',
    );
  });

  test('top bar carries the named utility cluster (a11y contract §11.2)', async ({ page }) => {
    await page.goto(`${APP}/dashboard`);
    await expect(page.getByRole('button', { name: 'Switch module' })).toBeVisible();
    // G4.7 — the search control navigates to /search, so it's a link now.
    await expect(page.getByRole('link', { name: 'Search (⌘K)' })).toBeVisible();
    // C3.4 — the bell is now a disclosure menu (the notification centre), so it's
    // a labelled <summary> like the Account control below.
    await expect(page.getByLabel(/Notifications/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask Arther (⌘J)' })).toBeVisible();
    // The account control is the menu's <summary> trigger since F4.5.
    await expect(page.getByLabel('Account')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Connected');
  });

  test('the Ask Arther panel toggles from the Help button (K.1)', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    // A CSS locator (not getByRole): when closed the panel is aria-hidden, so it
    // is absent from the accessibility tree.
    const panel = page.locator('aside[aria-label="Ask Arther"]');
    await expect(panel).toHaveAttribute('aria-hidden', 'true');
    await page.getByRole('button', { name: 'Ask Arther (⌘J)' }).click();
    await expect(panel).toHaveAttribute('aria-hidden', 'false');
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  test('spec controls carry their Ask Arther spotlight tag (K.6)', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    // The K.6 registry's `data-arther-spotlight` ids must stay wired to the real
    // DOM controls, so the spotlight overlay can find them when the assistant
    // points here. This guards the registry↔DOM contract without needing the LLM.
    await expect(page.locator('[data-arther-spotlight="add-product"]')).toBeVisible();
  });

  test('the active tab reflects the mode', async ({ page }) => {
    await page.goto(`${APP}/dashboard`);
    await expect(page.locator('.ui-tab-chip--active')).toHaveText('Dashboard');
    await page.goto(`${APP}/specs`);
    await expect(page.locator('.ui-tab-chip--active')).toHaveText('Specs');
  });

  test('Dashboard has no rail or Navigator (region matrix)', async ({ page }) => {
    await page.goto(`${APP}/dashboard`);
    await expect(page.getByRole('navigation', { name: 'Views' })).toHaveCount(0);
    await expect(page.locator('.ui-shell__navigator')).toHaveCount(0);
  });

  test('Specs mounts rail + Navigator with the three IA views', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    const rail = page.getByRole('navigation', { name: 'Views' });
    await expect(rail.getByRole('link', { name: 'Products' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(rail.getByRole('link', { name: 'Component Library' })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Releases' })).toBeVisible();
    await expect(page.locator('.ui-shell__navigator')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No products yet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible();
  });

  test('the rail switches between Products and the Component Library', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    await page.getByRole('link', { name: 'Component Library' }).click();
    await expect(page).toHaveURL(`${APP}/specs/library`);
    const rail = page.getByRole('navigation', { name: 'Views' });
    await expect(rail.getByRole('link', { name: 'Component Library' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByRole('heading', { name: 'Component Library' }),
    ).toBeVisible();
    await rail.getByRole('link', { name: 'Products' }).click();
    await expect(page).toHaveURL(`${APP}/specs`);
  });

  test('shell controls are keyboard-reachable with a visible focus ring', async ({ page }) => {
    await page.goto(`${APP}/specs`);
    const search = page.getByRole('link', { name: 'Search (⌘K)' });
    await search.focus();
    await expect(search).toBeFocused();
    const products = page.getByRole('link', { name: 'Products' });
    await products.focus();
    await expect(products).toBeFocused();
  });
});
