import { expect, test } from '@playwright/test';

const APP = 'http://localhost:3000';

/**
 * Auth surfaces (auth IA). These run WITHOUT Supabase env — middleware passes
 * through and server actions return the typed not-provisioned error — so the
 * suite exercises rendering, label association, client validation, and the
 * graceful-degradation path that flips on when provisioning completes.
 */
test.describe('auth surfaces (outside the shell)', () => {
  test('login renders the branded card with labeled fields and both methods', async ({ page }) => {
    await page.goto(`${APP}/login`);
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    // No app shell on auth surfaces.
    await expect(page.locator('.ui-topbar')).toHaveCount(0);
    // Persistent visible <label for> association (a11y §11.4).
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('login validates fields inline via aria-describedby', async ({ page }) => {
    await page.goto(`${APP}/login`);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-describedby', 'email-error');
  });

  test('valid submission degrades gracefully while unprovisioned', async ({ page }) => {
    await page.goto(`${APP}/login`);
    await page.getByLabel('Email').fill('alice@example.com');
    await page.getByLabel('Password').fill('a-long-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('.auth-error')).toContainText('not configured');
  });

  test('signup renders with hint text and legal footnote', async ({ page }) => {
    await page.goto(`${APP}/signup`);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByText('At least 8 characters.')).toBeVisible();
    await expect(page.getByText(/terms of service/)).toBeVisible();
  });

  test('forgot password confirms without account enumeration', async ({ page }) => {
    await page.goto(`${APP}/forgot`);
    await page.getByLabel('Email').fill('whoever@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    // Provisioned: identical confirmation whether or not the account exists.
    // Unprovisioned (this suite's baseline): the typed not-configured error.
    await expect(page.locator('.auth-error').or(page.getByRole('status'))).toBeVisible();
  });

  test('create-workspace shows a live portal-slug preview', async ({ page }) => {
    await page.goto(`${APP}/welcome`);
    await page.getByLabel('Workspace name').fill('Acme Motors GmbH');
    await expect(page.getByTestId('slug-preview')).toContainText('acme-motors-gmbh.arther.io');
  });

  test('reset and invite dead-end states render', async ({ page }) => {
    await page.goto(`${APP}/reset/some-token`);
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    await expect(page.getByText(/expire after one hour/)).toBeVisible();

    await page.goto(`${APP}/invite/expired-token`);
    await expect(page.getByRole('heading', { name: /isn’t valid/ })).toBeVisible();
    await expect(page.getByText(/ask your workspace admin/i)).toBeVisible();
  });
});
