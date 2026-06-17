'use client';

import { useActionState, useRef } from 'react';
import { Button } from '@arther/ui';
import { addCommentAction, moveFieldAction, setArchivedAction, type SpecsFormState } from './actions';

/**
 * F5.8 composer — commenting is a member right, viewers included. With a
 * `parentCommentId` it posts a reply (F6 threading) in a compact inline form.
 */
export function CommentForm({
  fieldId,
  parentCommentId,
}: {
  fieldId: string;
  parentCommentId?: string;
}) {
  const isReply = Boolean(parentCommentId);
  const domId = parentCommentId ? `reply-${parentCommentId}` : `comment-${fieldId}`;
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
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      <label className="ui-field__label" htmlFor={domId}>
        {isReply ? 'Reply' : 'Comment'}
      </label>
      <textarea
        id={domId}
        name="body"
        rows={isReply ? 1 : 2}
        className="ui-field__input"
        placeholder={isReply ? 'Reply…' : 'The value snapshot rides along automatically.'}
      />
      <div className="specs-form--row">
        <Button type="submit" size="sm" variant={isReply ? 'ghost' : 'secondary'} disabled={pending}>
          {pending ? 'Posting…' : isReply ? 'Reply' : 'Comment'}
        </Button>
        {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      </div>
    </form>
  );
}

/** F6 — reorder a field within its category. Two compact buttons; the action
 * no-ops at the category boundary, but we disable them there for clarity. */
export function FieldOrderControls({
  fieldId,
  isFirst,
  isLast,
}: {
  fieldId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [, action, pending] = useActionState<SpecsFormState, FormData>(moveFieldAction, {});
  return (
    <span className="specs-form--inline" style={{ display: 'inline-flex', gap: 2 }}>
      <form action={action} className="specs-form--inline">
        <input type="hidden" name="fieldId" value={fieldId} />
        <input type="hidden" name="direction" value="-1" />
        <button
          type="submit"
          className="specs-value-button"
          aria-label="Move field up"
          disabled={pending || isFirst}
        >
          ↑
        </button>
      </form>
      <form action={action} className="specs-form--inline">
        <input type="hidden" name="fieldId" value={fieldId} />
        <input type="hidden" name="direction" value="1" />
        <button
          type="submit"
          className="specs-value-button"
          aria-label="Move field down"
          disabled={pending || isLast}
        >
          ↓
        </button>
      </form>
    </span>
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
