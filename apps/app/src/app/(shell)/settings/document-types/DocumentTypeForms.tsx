'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@arther/ui';
import {
  archiveDocumentTypeAction,
  createDocumentTypeAction,
  forkDocumentTypeAction,
  renameDocumentTypeAction,
  type DocTypeFormState,
} from './actions';

/** Create an empty workspace document type — sections are added afterwards (G0.2). */
export function CreateDocumentTypeForm() {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    createDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <TextField
        id="doctype-name"
        name="name"
        label="New document type"
        placeholder="e.g. Compliance Certificate"
        error={state.error}
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="doctype-description">
          Description
        </label>
        <textarea
          id="doctype-description"
          name="description"
          className="ui-field__input"
          rows={2}
          placeholder="What this kind of document produces"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create type'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Created.</p> : null}
    </form>
  );
}

/** Fork a built-in (or any type) into an editable workspace copy. */
export function ForkButton({ sourceId, label = 'Fork' }: { sourceId: string; label?: string }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    forkDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="sourceId" value={sourceId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Forking…' : label}
      </Button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

export function RenameDocumentTypeForm({
  id,
  currentName,
  currentDescription,
}: {
  id: string;
  currentName: string;
  currentDescription: string | null;
}) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    renameDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="id" value={id} />
      <TextField
        id={`rename-${id}`}
        name="name"
        label="Name"
        defaultValue={currentName}
        error={state.error}
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={`describe-${id}`}>
          Description
        </label>
        <textarea
          id={`describe-${id}`}
          name="description"
          className="ui-field__input"
          rows={2}
          defaultValue={currentDescription ?? ''}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Saved.</p> : null}
    </form>
  );
}

/** Archive (confirm first) or restore a workspace type; built-ins never archive. */
export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    archiveDocumentTypeAction,
    {},
  );
  return (
    <form
      action={action}
      className="specs-form--inline"
      onSubmit={(e) => {
        if (!archived && !confirm('Archive this document type? New documents can no longer use it; existing documents are unaffected.')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? '…' : archived ? 'Restore' : 'Archive'}
      </Button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}
