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
    // Best-effort: landing in the shell confirms auth; don't hard-fail the whole
    // run if the redirect target differs — the captured shots will reveal it.
    await page.waitForURL('**/dashboard', { timeout: 30_000 }).catch(() => {});
    await page.context().storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
