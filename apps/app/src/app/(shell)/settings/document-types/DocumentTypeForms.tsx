'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@arther/ui';
import {
  createDocumentTypeAction,
  forkDocumentTypeAction,
  renameDocumentTypeAction,
  setDocumentTypeArchivedAction,
  type DocumentTypeFormState,
} from './actions';

/** Create a workspace Document Type from scratch — sections are added later (G0.2). */
export function CreateDocumentTypeForm() {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    createDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <TextField
        id="new-type-name"
        name="name"
        label="New document type"
        placeholder="e.g. Service Bulletin"
        error={state.error}
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="new-type-description">
          Description (optional)
        </label>
        <textarea
          id="new-type-description"
          name="description"
          className="ui-field__input"
          rows={2}
          placeholder="What kind of document is this?"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create document type'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Created.</p> : null}
    </form>
  );
}

/** Fork a built-in into an editable workspace copy (carries its sections + roles). */
export function ForkButton({ documentTypeId, name }: { documentTypeId: string; name: string }) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    forkDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="documentTypeId" value={documentTypeId} />
      <input type="hidden" name="name" value={`${name} (copy)`} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Fork ${name} into an editable copy`}
        disabled={pending}
      >
        {pending ? 'Forking…' : 'Fork to edit'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

/** Rename / re-describe a workspace type, behind a disclosure to keep the list calm. */
export function RenameDocumentTypeForm({
  documentTypeId,
  name,
  description,
}: {
  documentTypeId: string;
  name: string;
  description: string | null;
}) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    renameDocumentTypeAction,
    {},
  );
  return (
    <details className="specs-grid__meta">
      <summary>Edit details</summary>
      <form action={action} className="specs-form" noValidate>
        <input type="hidden" name="documentTypeId" value={documentTypeId} />
        <TextField
          id={`rename-${documentTypeId}`}
          name="name"
          label="Name"
          defaultValue={name}
          error={state.error}
        />
        <div className="ui-field">
          <label className="ui-field__label" htmlFor={`describe-${documentTypeId}`}>
            Description
          </label>
          <textarea
            id={`describe-${documentTypeId}`}
            name="description"
            className="ui-field__input"
            rows={2}
            defaultValue={description ?? ''}
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {state.done ? <span className="specs-grid__meta">Saved.</span> : null}
      </form>
    </details>
  );
}

/** Archive (or restore) a workspace type — the only destructive path (no hard delete). */
export function ArchiveDocumentTypeButton({
  documentTypeId,
  name,
  archived,
}: {
  documentTypeId: string;
  name: string;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    setDocumentTypeArchivedAction,
    {},
  );
  return (
    <form
      action={action}
      className="specs-form--inline"
      onSubmit={(e) => {
        if (
          !archived &&
          !window.confirm(
            `Archive “${name}”? New documents can't be created from it, but existing documents are untouched.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="documentTypeId" value={documentTypeId} />
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
