'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@arther/ui';
import {
  createDocumentTypeAction,
  forkDocumentTypeAction,
  setDocumentTypeArchivedAction,
  updateDocumentTypeAction,
  type DocumentTypeFormState,
} from './actions';

/** Create a workspace Document Type from scratch (sections added on its detail page). */
export function NewDocumentTypeForm() {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    createDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <TextField
        id="new-doctype-name"
        name="name"
        label="New document type"
        placeholder="Compliance Report"
        error={state.error}
      />
      <TextField
        id="new-doctype-description"
        name="description"
        label="Description (optional)"
        placeholder="What this kind of document produces"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Creating…' : 'Create document type'}
      </Button>
    </form>
  );
}

/** Built-ins are forkable, not editable — this is the only action on a built-in. */
export function ForkButton({ sourceId, name }: { sourceId: string; name: string }) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    forkDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="sourceId" value={sourceId} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Fork ${name} into an editable copy`}
        disabled={pending}
      >
        {pending ? 'Forking…' : 'Fork'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

/** Archive / restore a workspace type (built-ins never archive). */
export function ArchiveButton({
  id,
  name,
  archived,
}: {
  id: string;
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
            `Archive “${name}”? It can't be used for new documents, but existing documents are unaffected. You can restore it later.`,
          )
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
        aria-label={`${archived ? 'Restore' : 'Archive'} ${name}`}
        disabled={pending}
      >
        {pending ? '…' : archived ? 'Restore' : 'Archive'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

/** Rename / re-describe a workspace type (detail page; built-ins render read-only). */
export function EditDocumentTypeForm({
  id,
  name,
  description,
}: {
  id: string;
  name: string;
  description: string | null;
}) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    updateDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="id" value={id} />
      <TextField id="doctype-name" name="name" label="Name" defaultValue={name} error={state.error} />
      <TextField
        id="doctype-description"
        name="description"
        label="Description"
        defaultValue={description ?? ''}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Saved.</p> : null}
    </form>
  );
}
