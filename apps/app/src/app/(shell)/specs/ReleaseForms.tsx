'use client';

import { useActionState, useState } from 'react';
import { Button } from '@arther/ui';
import { createReleaseAction, deleteReleaseAction, type SpecsFormState } from './actions';

/**
 * Releases are explicit user action only (§3.8): name + tag from the product
 * page; field edits accumulate in "latest" until someone decides to snapshot.
 */
export function CreateReleaseForm({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    async (prev, formData) => {
      const result = await createReleaseAction(prev, formData);
      if (!result.error) setOpen(false);
      return result;
    },
    {},
  );

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Create release
      </Button>
    );
  }

  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="productId" value={productId} />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="release-name">
          Name
        </label>
        <input
          id="release-name"
          name="name"
          className="ui-field__input"
          placeholder="v2.1-release"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="release-tag">
          Tag
        </label>
        <input id="release-tag" name="tag" className="ui-field__input" placeholder="v2.1" />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="release-notes">
          Notes
        </label>
        <input
          id="release-notes"
          name="notes"
          className="ui-field__input"
          placeholder="Optional"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Snapshotting…' : 'Create release'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}

/** Deletion needs the confirmation step (§3.8); the 0013 guard has the final say. */
export function DeleteReleaseButton({ releaseId, name }: { releaseId: string; name: string }) {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    deleteReleaseAction,
    {},
  );
  return (
    <form
      action={action}
      className="specs-form--inline"
      onSubmit={(e) => {
        if (!window.confirm(`Delete release “${name}”? Its pinned snapshot goes with it.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="releaseId" value={releaseId} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Delete release ${name}`}
        disabled={pending}
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
