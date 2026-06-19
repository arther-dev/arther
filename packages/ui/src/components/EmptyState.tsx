import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  /** One-sentence description of the area's purpose (onboarding spec). */
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  /** K.9 — a one-time "Ask Arther" nudge slot, rendered below the CTAs. */
  nudge?: ReactNode;
}

/**
 * Standardized first-run empty state (Handoff 02 §9): a one-line description +
 * primary + secondary/ghost CTA, with an optional one-time assistant nudge below
 * (Phase 4 K.9). The nudge is app-supplied so this stays presentational.
 */
export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  nudge,
}: EmptyStateProps) {
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
      {nudge}
    </div>
  );
}
