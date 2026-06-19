'use client';

import { useEffect, useState } from 'react';
import { useAssistant } from './AssistantContext';

const STORAGE_PREFIX = 'arther.nudge.';

/**
 * K.9 — a one-time "Ask Arther" nudge for empty states. Shows a single subtle
 * line + a button that opens the assistant; once dismissed (or used) it stays
 * hidden for that `id` (localStorage), so a returning user isn't nagged. Renders
 * nothing until mounted (avoids a hydration flash) or once already dismissed.
 */
export function AssistantNudge({ id, prompt }: { id: string; prompt: string }) {
  const { openPanel } = useAssistant();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) !== 'done');
    } catch {
      setShow(true);
    }
  }, [id]);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, 'done');
    } catch {
      // ignore — best-effort persistence
    }
  };

  if (!show) return null;

  return (
    <p className="ui-empty-state__nudge specs-grid__meta" style={{ marginTop: 12 }}>
      New here?{' '}
      <button
        type="button"
        className="specs-value-button"
        onClick={() => {
          dismiss();
          openPanel();
        }}
      >
        Ask Arther
      </button>{' '}
      {prompt}{' '}
      <button type="button" className="specs-value-button" aria-label="Dismiss tip" onClick={dismiss}>
        Dismiss
      </button>
    </p>
  );
}
