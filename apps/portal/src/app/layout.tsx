import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Arther Portal',
  description: 'Published product documentation',
};

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
