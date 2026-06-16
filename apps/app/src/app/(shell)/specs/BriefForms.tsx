'use client';

import { useActionState } from 'react';
import type { BriefEntityType } from '@arther/types';
import { Button } from '@arther/ui';
import { fillPlaceholdersAction, saveBriefFragmentAction, type SpecsFormState } from './actions';

/**
 * Plain-text fragment editor (generator spec §5.7: brief fragments are AI
 * generation inputs — the model reads semantic content, not formatting, so the
 * surface is deliberately a textarea, not rich text). Saving an empty body
 * clears the fragment.
 */
export function BriefFragmentForm({
  entityType,
  entityId,
  fragmentKey,
  content,
}: {
  entityType: BriefEntityType;
  entityId: string;
  fragmentKey: string;
  content: string;
}) {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    saveBriefFragmentAction,
    {},
  );
  const [fillState, fillAction, fillPending] = useActionState<SpecsFormState, FormData>(
    fillPlaceholdersAction,
    {},
  );
  const fieldId = `brief-${fragmentKey}`;
  const waiting = state.placeholdersWaiting ?? 0;
  const filled = fillState.placeholdersFilled;
  return (
    <>
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="key" value={fragmentKey} />
      <label className="ui-field__label" htmlFor={fieldId}>
        Fragment content
      </label>
      <textarea
        id={fieldId}
        name="content"
        className="specs-textarea"
        rows={12}
        defaultValue={content}
        placeholder="Write the narrative for this fragment…"
        aria-describedby={state.error ? `${fieldId}-error` : undefined}
      />
      {state.error ? (
        <p id={`${fieldId}-error`} role="alert" className="ui-field__error">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save fragment'}
      </Button>
    </form>

    {/* G7.2 — once the fragment has content, offer to fill the blocks waiting on it. */}
    {waiting > 0 && filled === undefined ? (
      <form action={fillAction} className="specs-form--row" style={{ marginTop: 8, gap: 8 }} noValidate>
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="key" value={fragmentKey} />
        <span className="specs-grid__meta">
          {waiting} block{waiting === 1 ? '' : 's'} {waiting === 1 ? 'is' : 'are'} waiting on this
          fragment.
        </span>
        <Button type="submit" size="sm" variant="secondary" disabled={fillPending}>
          {fillPending ? 'Filling…' : `Fill ${waiting} block${waiting === 1 ? '' : 's'}`}
        </Button>
      </form>
    ) : null}
    {filled !== undefined ? (
      <p className="specs-grid__meta" role="status" style={{ marginTop: 8 }}>
        Filled {filled} block{filled === 1 ? '' : 's'} from this fragment.
      </p>
    ) : null}
    {fillState.error ? <p className="ui-field__error">{fillState.error}</p> : null}
    </>
  );
}
