'use client';

import { createContext, useContext } from 'react';

export interface AssistantContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

/** Access the Ask Arther panel's open state + controls (K.1). */
export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('useAssistant must be used within <AssistantProvider>');
  return value;
}
