import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arther',
  description: 'Living technical documentation for hardware companies',
};

// The strict CSP (F8.3) carries a per-request nonce minted in middleware; Next
// only stamps that nonce onto its scripts when the route renders per-request,
// so the authenticated app (personalised, dynamic anyway) opts out of static
// prerendering wholesale rather than leaving pre-auth pages' scripts nonce-less.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
