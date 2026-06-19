'use client';

import { useCallback, useEffect, useState } from 'react';
import { AssistantContext } from './AssistantContext';
import { AskArtherPanel } from './AskArtherPanel';

/**
 * K.1 — mounts the Ask Arther panel once for the whole shell and owns its open
 * state + the global ⌘J / Ctrl+J toggle and Escape-to-close. The top bar's Help
 * button calls `toggle` through this context. Session-scoped: nothing persists.
 */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <AssistantContext.Provider value={{ open, toggle, close }}>
      {children}
      <AskArtherPanel />
    </AssistantContext.Provider>
  );
}
