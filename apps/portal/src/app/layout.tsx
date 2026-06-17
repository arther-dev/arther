import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arther Portal',
  description: 'Published product documentation',
};

// Required for the per-request CSP nonce (F8.3) to reach Next's scripts.
// REVISIT at C6: published-doc pages must be CDN-cacheable (static), which a
// per-request nonce forecloses — switch the portal to a build-time hash-based
// CSP (or a static-nonce strategy) when cached published docs land. The stub
// has no such pages today, so forcing dynamic costs nothing now.
export const dynamic = 'force-dynamic';

/**
 * Public portal stub (F0.1). Light + customer-brand-skinned at Phase 3 C6 —
 * deliberately NOT bound to the dark app design system (two accent systems;
 * Handoff 01 §2.5.4). Reads only published_snapshots when it ships.
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
