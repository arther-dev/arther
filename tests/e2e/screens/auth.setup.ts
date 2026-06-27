import { chromium, type FullConfig } from '@playwright/test';

/**
 * Global setup for the screenshot pass: log in as the seeded QA user and persist
 * the session so authenticated routes render logged-in. Only wired when
 * ARTHER_QA_EMAIL/PASSWORD are present (see screenshots.config.ts); otherwise the
 * pass runs anonymously and authed routes capture the login redirect.
 */
export const STORAGE_STATE = './screens/.auth/state.json';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const email = process.env.ARTHER_QA_EMAIL;
  const password = process.env.ARTHER_QA_PASSWORD;
  const app = process.env.ARTHER_STAGING_APP_URL ?? 'http://localhost:3000';
  if (!email || !password) return;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`${app}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    // Fail LOUD if login didn't take. Swallowing this would silently capture
    // logged-out screenshots for the entire trip and look like passing QA.
    try {
      await page.waitForURL('**/dashboard', { timeout: 30_000 });
    } catch {
      const at = page.url();
      const authError = await page
        .locator('.auth-error')
        .textContent()
        .catch(() => null);
      throw new Error(
        `QA login failed: never reached the dashboard (stuck at ${at}). ` +
          (authError ? `Auth error: "${authError}". ` : '') +
          'Check ARTHER_QA_EMAIL/PASSWORD and that the target uses real GoTrue auth — ' +
          'the local Postgres auth shim cannot log in (see Development/Autonomous/staging.md).',
      );
    }
    await page.context().storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
