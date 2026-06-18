import type { Metadata } from 'next';
import './globals.css';
import { portalBaseUrl } from '../lib/portal-url';

export const metadata: Metadata = {
  // C9.3 — the canonical origin: document pages set relative canonicals/OG URLs
  // that resolve against this, and the sitemap/robots point at the same host.
  metadataBase: new URL(portalBaseUrl()),
  title: { default: 'Arther Portal', template: '%s · Arther' },
  description: 'Published product documentation',
};

/**
 * Public portal (Phase 3 C6). Light + customer-brand-skinned — deliberately NOT
 * bound to the dark app design system (Handoff 01 §2.5.4). Reads only
 * published_snapshots. As of C6.5 the per-request nonce CSP is replaced by a
 * static CSP (middleware) so document pages are CDN-cacheable (ISR); `revalidate`
 * is set per route and on-publish revalidation busts the cache (C6.5).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#ffffff' }}>
        {/* C9.5 — skip link: the first focusable element on every page, jumping
            past any preamble to the <main id="main-content"> landmark below. */}
        <a className="portal-skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
