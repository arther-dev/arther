import { test } from '@playwright/test';
import { routes, APP_BASE, PORTAL_BASE } from './routes';

/**
 * Captures a full-page screenshot of every static surface (routes.ts) into
 * `screenshots-output/`. Run via `pnpm test:screens`. The QA agent diffs these
 * against the visual spec (Development/Handoff) and files `visual` issues.
 *
 * This is NOT part of the required CI gate — it needs a provisioned/seeded app
 * and is driven by the QA agent, not by every PR.
 */
for (const r of routes) {
  test(`screenshot ${r.name}`, async ({ page }) => {
    const base = r.app === 'app' ? APP_BASE : PORTAL_BASE;
    const response = await page.goto(`${base}${r.path}`, { waitUntil: 'networkidle' });
    // Record HTTP status in the title via annotation so a 4xx/5xx is obvious in
    // the report even before looking at the image.
    test.info().annotations.push({
      type: 'status',
      description: String(response?.status() ?? 'no-response'),
    });
    await page.screenshot({
      path: `screenshots-output/${r.name}.png`,
      fullPage: true,
    });
  });
}
