import Link from 'next/link';

/** Persistent step indicator (Handoff 04 §B) — shared across import screens. */

const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'structure', label: 'Structural review' },
  { id: 'fields', label: 'Field review' },
  { id: 'validate', label: 'Validation' },
  { id: 'commit', label: 'Commit' },
] as const;

export type ImportStep = (typeof STEPS)[number]['id'];

export function ImportStepper({
  current,
  sessionId,
}: {
  current: ImportStep;
  /** When the session exists, completed/later review steps are navigable. */
  sessionId?: string;
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Import steps">
      <ol className="import-stepper">
        {STEPS.map((step, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo';
          const href =
            sessionId && step.id !== 'upload' ? `/specs/import/${sessionId}?step=${step.id}` : null;
          return (
            <li
              key={step.id}
              className={`import-stepper__step import-stepper__step--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {href && state !== 'current' ? (
                <Link href={href}>{step.label}</Link>
              ) : (
                <span>{step.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
