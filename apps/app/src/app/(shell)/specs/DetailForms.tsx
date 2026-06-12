'use client';

import { useActionState, useRef } from 'react';
import { Button } from '@arther/ui';
import { addCommentAction, setArchivedAction, type SpecsFormState } from './actions';

/** F5.8 composer — commenting is a member right, viewers included. */
export function CommentForm({ fieldId }: { fieldId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    async (prev, formData) => {
      const result = await addCommentAction(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {},
  );
  return (
    <form ref={formRef} action={action} className="specs-form" noValidate>
      <input type="hidden" name="fieldId" value={fieldId} />
      <label className="ui-field__label" htmlFor={`comment-${fieldId}`}>
        Comment
      </label>
      <textarea
        id={`comment-${fieldId}`}
        name="body"
        rows={2}
        className="ui-field__input"
        placeholder="The value snapshot rides along automatically."
      />
      <div className="specs-form--row">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Posting…' : 'Comment'}
        </Button>
        {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      </div>
    </form>
  );
}

/** F5.10 — soft archive/restore; hard delete stays DB-guarded with no UI. */
export function ArchiveToggle({
  entity,
  id,
  archived,
  label,
}: {
  entity: 'products' | 'components' | 'spec_fields';
  id: string;
  /** Current state — the button offers the transition. */
  archived: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    setArchivedAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={String(!archived)} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`${archived ? 'Restore' : 'Archive'} ${label}`}
        disabled={pending}
      >
        {pending ? 'Working…' : archived ? 'Restore' : 'Archive'}
      </button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
