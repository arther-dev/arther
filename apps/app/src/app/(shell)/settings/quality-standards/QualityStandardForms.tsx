'use client';

import { useEffect } from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import type { QualityStandardRow } from '@arther/db';
import { formatQualityConstraints, QUALITY_CONSTRAINT_SCOPES } from '@arther/types';
import { Button, TextField } from '@arther/ui';
import {
  createQualityStandardAction,
  deleteQualityStandardAction,
  updateQualityStandardAction,
  type QualityStandardFormState,
} from './actions';

/** The shared field set — used by both the create and edit forms. */
function StandardFields({ standard }: { standard?: QualityStandardRow }) {
  return (
    <>
      <TextField
        id="qs-name"
        name="name"
        label="Name"
        defaultValue={standard?.name ?? ''}
        placeholder="House editorial discipline"
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="qs-constraints">
          Constraints (one per line: <code>scope | target | rule | description</code>)
        </label>
        <textarea
          id="qs-constraints"
          name="constraints"
          className="ui-field__input"
          rows={8}
          defaultValue={formatQualityConstraints(standard?.constraints ?? [])}
          placeholder={
            'global | | require_summary: true | Every document opens with a summary\nsection | Specifications | max_words: 150 | Keep the spec section tight\nblock_type | step | imperative_mood: true | Steps read as commands'
          }
        />
        <p className="ui-field__hint">
          Scope is one of {QUALITY_CONSTRAINT_SCOPES.join(', ')}. Leave the target blank for global
          rules. Lines that don&apos;t parse are dropped on save.
        </p>
      </div>
    </>
  );
}

export function CreateQualityStandardForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<QualityStandardFormState, FormData>(
    createQualityStandardAction,
    {},
  );
  useEffect(() => {
    if (state.createdId) router.push(`/settings/quality-standards/${state.createdId}`);
  }, [state.createdId, router]);

  return (
    <form action={action} className="specs-form" noValidate>
      <StandardFields />
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create quality standard'}
      </Button>
    </form>
  );
}

export function EditQualityStandardForm({ standard }: { standard: QualityStandardRow }) {
  const [state, action, pending] = useActionState<QualityStandardFormState, FormData>(
    updateQualityStandardAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="id" value={standard.id} />
      <StandardFields standard={standard} />
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      <div className="specs-form--row">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        {state.done ? <span className="specs-grid__meta">Saved.</span> : null}
      </div>
    </form>
  );
}

export function DeleteQualityStandardButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<QualityStandardFormState, FormData>(
    deleteQualityStandardAction,
    {},
  );
  return (
    <form
      action={action}
      className="specs-form--inline"
      onSubmit={(e) => {
        if (!window.confirm(`Delete “${name}”? This can't be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Delete ${name}`}
        disabled={pending}
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}
