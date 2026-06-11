import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  /** One-sentence description of the area's purpose (onboarding spec). */
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}

/**
 * Standardized first-run empty state (Handoff 02 §9): description +
 * primary + secondary/ghost CTA. The one-time assistant nudge arrives with
 * Ask Arther (Phase 4 K.9).
 */
export function EmptyState({ title, description, primaryAction, secondaryAction }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      <h2 className="ui-empty-state__title">{title}</h2>
      <p className="ui-empty-state__description">{description}</p>
      {(primaryAction || secondaryAction) && (
        <div className="ui-empty-state__actions">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
