'use client';

import { useEffect, useState } from 'react';

export interface SpotlightRequest {
  /** The `data-arther-spotlight` id to highlight. */
  id: string;
  /** Bumped on each request so re-spotlighting the same id re-fires the effect. */
  nonce: number;
}

const PADDING = 6;
const DISMISS_MS = 3800;

/**
 * K.6 — a non-blocking spotlight overlay. When the assistant's answer points to
 * an on-screen control, it asks (via the assistant context) to highlight the
 * element carrying `data-arther-spotlight="<id>"`. We scroll it into view, draw a
 * glowing ring around its live bounding box, and auto-dismiss after a few seconds
 * (or on Escape). `pointer-events: none` everywhere — the user can keep working,
 * and if the element isn't on the page the overlay simply renders nothing.
 */
export function SpotlightOverlay({ request }: { request: SpotlightRequest | null }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!request) {
      setRect(null);
      return;
    }
    const selector = `[data-arther-spotlight="${CSS.escape(request.id)}"]`;
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) {
      setRect(null);
      return;
    }

    let active = true;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const place = () => {
      if (active) setRect(el.getBoundingClientRect());
    };
    place();
    // Re-measure once the smooth scroll has likely settled, then track movement.
    const settle = window.setTimeout(place, 350);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRect(null);
    };
    window.addEventListener('keydown', onKey);
    const dismiss = window.setTimeout(() => setRect(null), DISMISS_MS);

    return () => {
      active = false;
      window.clearTimeout(settle);
      window.clearTimeout(dismiss);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', onKey);
    };
  }, [request?.id, request?.nonce]);

  if (!rect) return null;

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 35 }}>
      <div
        style={{
          position: 'absolute',
          top: rect.top - PADDING,
          left: rect.left - PADDING,
          width: rect.width + PADDING * 2,
          height: rect.height + PADDING * 2,
          border: '2px solid var(--accent, #4f46e5)',
          borderRadius: 8,
          boxShadow:
            '0 0 0 4px rgba(79,70,229,0.25), 0 0 18px 2px rgba(79,70,229,0.45), 0 0 0 9999px rgba(15,23,42,0.06)',
          transition: 'top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease',
        }}
      />
    </div>
  );
}
