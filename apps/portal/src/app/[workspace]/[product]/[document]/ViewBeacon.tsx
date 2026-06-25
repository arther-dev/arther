'use client';

import { useEffect } from 'react';

/**
 * C9.6 — fire a one-shot `document_viewed` beacon to `/api/track` once the page
 * mounts. The document page is ISR-cached, so this client beacon (not a server
 * render) is what counts a real visit. `navigator.sendBeacon` is used when
 * available (survives navigation away); otherwise a keepalive `fetch`. It carries
 * only the URL coordinates the page already exposes, and any failure is ignored.
 */
export function ViewBeacon({
  workspace,
  product,
  document,
  version,
  variant,
}: {
  workspace: string;
  product: string;
  document: string;
  version?: string;
  /** V.9 — the variant slug for a per-variant page; omitted on the base page. */
  variant?: string;
}) {
  useEffect(() => {
    const payload = JSON.stringify({
      type: 'document_viewed',
      workspace,
      product,
      document,
      version,
      variant,
    });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
      } else {
        void fetch('/api/track', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      // analytics are best-effort
    }
  }, [workspace, product, document, version, variant]);

  return null;
}
