'use client';

import { useActionState } from 'react';
import type { DocumentTypeRow } from '@arther/db';
import { Button, TextField } from '@arther/ui';
import {
  archiveDocumentTypeAction,
  createDocumentTypeAction,
  forkDocumentTypeAction,
  renameDocumentTypeAction,
  type DocumentTypeFormState,
} from './actions';

/** Create a workspace Document Type from scratch. */
export function CreateDocumentTypeForm() {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    createDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <TextField
        id="doc-type-name"
        name="name"
        label="New document type"
        placeholder="e.g. Service Bulletin"
        error={state.error}
      />
      <TextField
        id="doc-type-description"
        name="description"
        label="Description (optional)"
        placeholder="What this type produces"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Created.</p> : null}
    </form>
  );
}

/** Fork a built-in into an editable workspace copy. */
export function ForkButton({ type }: { type: DocumentTypeRow }) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    forkDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="typeId" value={type.id} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Fork ${type.name} into an editable copy`}
        disabled={pending}
      >
        {pending ? 'Forking…' : 'Fork to edit'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

/** Rename / re-describe a workspace type. */
export function RenameDocumentTypeForm({ type }: { type: DocumentTypeRow }) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    renameDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="typeId" value={type.id} />
      <TextField
        id={`rename-${type.id}`}
        name="name"
        label="Name"
        defaultValue={type.name}
        error={state.error}
      />
      <TextField
        id={`describe-${type.id}`}
        name="description"
        label="Description"
        defaultValue={type.description ?? ''}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Saved.</p> : null}
    </form>
  );
}

/** Archive a workspace type (or restore an archived one). */
export function ArchiveButton({ type, archived }: { type: DocumentTypeRow; archived: boolean }) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    archiveDocumentTypeAction,
    {},
  );
  const label = archived ? 'Restore' : 'Archive';
  return (
    <form
      action={action}
      className="specs-form--inline"
      onSubmit={(e) => {
        if (
          !archived &&
          !window.confirm(
            `Archive ${type.name}? New documents can't be created from it, but existing documents are untouched.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="typeId" value={type.id} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`${label} ${type.name}`}
        disabled={pending}
      >
        {pending ? `${label}…` : label}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}
