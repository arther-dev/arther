'use client';

import { createContext, useContext } from 'react';

export interface AssistantContextValue {
  open: boolean;
  toggle: () => void;
  /** Open the panel (idempotent) — used by the K.9 empty-state nudges. */
  openPanel: () => void;
  close: () => void;
  /** K.6 — highlight an on-screen control by its `data-arther-spotlight` id. */
  requestSpotlight: (targetId: string) => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

/** Access the Ask Arther panel's open state + controls (K.1). */
export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('useAssistant must be used within <AssistantProvider>');
  return value;
}
