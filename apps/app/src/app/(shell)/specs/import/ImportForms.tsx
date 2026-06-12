'use client';

import { useActionState } from 'react';
import { Button } from '@arther/ui';
import {
  commitImportAction,
  discardImportAction,
  retryInterpretationAction,
  saveFieldDecisionsAction,
  saveStructuralDecisionsAction,
  uploadAndInterpretAction,
  type ImportFormState,
} from './actions';

/**
 * F7.4 client shells: each step is one form. Inputs are server-rendered and
 * passed through as children; these wrappers own pending/error state only.
 */

export function UploadForm({
  products,
  preselectedProductId,
}: {
  products: Array<{ id: string; name: string }>;
  preselectedProductId?: string;
}) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    uploadAndInterpretAction,
    {},
  );
  return (
    <form action={action} className="import-upload" noValidate>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="import-file">
          Spec sheet (.xlsx or .csv)
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".xlsx,.csv"
          className="import-dropzone"
          required
        />
        <p className="ui-field__hint">
          No column mapping needed — the structure is interpreted for you, then you review
          everything before anything is saved.
        </p>
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="import-target">
          Import into
        </label>
        <select
          id="import-target"
          name="targetProductId"
          className="ui-field__input"
          defaultValue={preselectedProductId ?? ''}
        >
          <option value="">New product (from the sheet)</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              Re-import: {p.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Interpreting your sheet — this can take a minute…' : 'Upload & interpret'}
      </Button>
      {state.error ? <p className="ui-field__error" role="alert">{state.error}</p> : null}
    </form>
  );
}

/** Generic review-step form: server-rendered inputs in, one submit out. */
export function ReviewStepForm({
  sessionId,
  step,
  submitLabel,
  children,
}: {
  sessionId: string;
  step: 'structure' | 'fields';
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    step === 'structure' ? saveStructuralDecisionsAction : saveFieldDecisionsAction,
    {},
  );
  return (
    <form action={action} className="import-step" noValidate>
      <input type="hidden" name="sessionId" value={sessionId} />
      {children}
      <footer className="import-step__footer">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {state.error ? <p className="ui-field__error" role="alert">{state.error}</p> : null}
      </footer>
    </form>
  );
}

export function CommitForm({ sessionId, summary }: { sessionId: string; summary: string }) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    commitImportAction,
    {},
  );
  return (
    <form action={action} className="import-step__footer" noValidate>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Committing…' : `Commit import (${summary})`}
      </Button>
      {state.error ? <p className="ui-field__error" role="alert">{state.error}</p> : null}
    </form>
  );
}

export function DiscardButton({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    discardImportAction,
    {},
  );
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm('Discard this import? Nothing has been applied.')) e.preventDefault();
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Discarding…' : 'Discard import'}
      </Button>
      {state.error ? <p className="ui-field__error" role="alert">{state.error}</p> : null}
    </form>
  );
}

export function RetryForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    retryInterpretationAction,
    {},
  );
  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Interpreting again…' : 'Retry interpretation'}
      </Button>
      {state.error ? <p className="ui-field__error" role="alert">{state.error}</p> : null}
    </form>
  );
}
