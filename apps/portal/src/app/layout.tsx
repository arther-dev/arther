import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arther Portal',
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
        {children}
      </body>
    </html>
  );
}
