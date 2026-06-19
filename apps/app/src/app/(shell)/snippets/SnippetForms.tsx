'use client';

import { useEffect } from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  libraryItemTypeDescription,
  LIBRARY_ITEM_TYPES,
  libraryItemTypeLabel,
} from '@arther/types';
import { Button, TextField } from '@arther/ui';
import {
  createSnippetAction,
  renameSnippetAction,
  setSnippetArchivedAction,
  type SnippetFormState,
} from './actions';

export function CreateSnippetForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<SnippetFormState, FormData>(
    createSnippetAction,
    {},
  );
  useEffect(() => {
    if (state.createdId) router.push(`/snippets/${state.createdId}`);
  }, [state.createdId, router]);

  return (
    <form action={action} className="specs-form" noValidate>
      <TextField id="li-name" name="name" label="Name" placeholder="Warranty notice" />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="li-type">
          Type
        </label>
        <select id="li-type" name="type" className="ui-field__input" defaultValue="snippet">
          {LIBRARY_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {libraryItemTypeLabel(t)}
            </option>
          ))}
        </select>
        <p className="ui-field__hint">
          <strong>Snippet</strong> — {libraryItemTypeDescription('snippet')}
          <br />
          <strong>Template</strong> — {libraryItemTypeDescription('template')}
        </p>
      </div>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending} data-arther-spotlight="create-snippet">
        {pending ? 'Creating…' : 'Create library item'}
      </Button>
    </form>
  );
}

export function RenameSnippetForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<SnippetFormState, FormData>(
    renameSnippetAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="id" value={id} />
      <TextField id="li-rename" name="name" label="Name" defaultValue={name} />
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      <div className="specs-form--row">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save name'}
        </Button>
        {state.done ? <span className="specs-grid__meta">Saved.</span> : null}
      </div>
    </form>
  );
}

export function ArchiveSnippetButton({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState<SnippetFormState, FormData>(
    setSnippetArchivedAction,
    {},
  );
  return (
    <form
      action={action}
      className="specs-form--inline"
      onSubmit={(e) => {
        if (
          !archived &&
          !window.confirm(`Archive “${name}”? Live embeds become static copies; it isn't deleted.`)
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={archived ? `Restore ${name}` : `Archive ${name}`}
        disabled={pending}
      >
        {pending ? '…' : archived ? 'Restore' : 'Archive'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}
