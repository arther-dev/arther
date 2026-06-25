/**
 * Route inventory for the autonomous visual-QA screenshot pass.
 *
 * This is the QA agent's checklist of every *static* surface. Dynamic routes
 * (e.g. /documents/[id]) are exercised by the QA agent while it drives real
 * flows, since they need live IDs — keep those out of here.
 *
 * When a new static route ships, add it here so the screenshot job and the QA
 * agent both pick it up (qa-agent.md step 2).
 */
export interface RouteDef {
  /** Stable file-name-safe id for the screenshot. */
  name: string;
  /** Path under the app/portal base. */
  path: string;
  app: 'app' | 'portal';
  /** True if the route lives behind the authenticated shell. */
  auth?: boolean;
}

export const APP_BASE = process.env.ARTHER_STAGING_APP_URL ?? 'http://localhost:3000';
export const PORTAL_BASE = process.env.ARTHER_STAGING_PORTAL_URL ?? 'http://localhost:3001';

export const routes: RouteDef[] = [
  // --- App: auth surfaces (outside the shell, no login needed) ---------------
  { name: 'app-login', path: '/login', app: 'app' },
  { name: 'app-signup', path: '/signup', app: 'app' },
  { name: 'app-forgot', path: '/forgot', app: 'app' },
  { name: 'app-welcome', path: '/welcome', app: 'app' },
  { name: 'app-design-tokens', path: '/design-tokens', app: 'app' },

  // --- App: authenticated shell (need the seeded session) --------------------
  { name: 'app-dashboard', path: '/dashboard', app: 'app', auth: true },
  { name: 'app-specs', path: '/specs', app: 'app', auth: true },
  { name: 'app-specs-generate', path: '/specs/generate', app: 'app', auth: true },
  { name: 'app-specs-import', path: '/specs/import', app: 'app', auth: true },
  { name: 'app-specs-library', path: '/specs/library', app: 'app', auth: true },
  { name: 'app-specs-releases', path: '/specs/releases', app: 'app', auth: true },
  { name: 'app-snippets', path: '/snippets', app: 'app', auth: true },
  { name: 'app-search', path: '/search', app: 'app', auth: true },
  { name: 'app-settings', path: '/settings', app: 'app', auth: true },
  { name: 'app-settings-analytics', path: '/settings/analytics', app: 'app', auth: true },
  { name: 'app-settings-brand', path: '/settings/brand-profiles', app: 'app', auth: true },
  { name: 'app-settings-doctypes', path: '/settings/document-types', app: 'app', auth: true },
  { name: 'app-settings-notifications', path: '/settings/notifications', app: 'app', auth: true },
  { name: 'app-settings-quality', path: '/settings/quality-standards', app: 'app', auth: true },

  // --- Portal: public ---------------------------------------------------------
  { name: 'portal-home', path: '/', app: 'portal' },
];
