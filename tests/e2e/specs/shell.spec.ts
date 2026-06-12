import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

test.describe('app shell frame (Handoff 02)', () => {
  test('home lands on the Dashboard (personal action queue)', async ({ page }) => {
    await page.goto(APP);
    await expect(page).toHaveURL(`${APP}/dashboard`);
    await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
  });

  test('top bar carries the named utility cluster (a11y contract §11.2)', async ({ page }) => {
    await page.goto(`${APP}/dashboard`);
    await expect(page.getByRole('button', { name: 'Switch module' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search (⌘K)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask Arther (⌘J)' })).toBeVisible();
    // The account control is the menu's <summary> trigger since F4.5.
    await expect(page.getByLabel('Account')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Connected');
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
    const search = page.getByRole('button', { name: 'Search (⌘K)' });
    await search.focus();
    await expect(search).toBeFocused();
    const products = page.getByRole('link', { name: 'Products' });
    await products.focus();
    await expect(products).toBeFocused();
  });
});
