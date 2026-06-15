'use client';

import { useActionState, useState } from 'react';
import { Button, TextField } from '@arther/ui';
import {
  archiveDocumentTypeAction,
  createDocumentTypeAction,
  forkDocumentTypeAction,
  renameDocumentTypeAction,
  type DocumentTypeFormState,
} from './actions';

/** Fork a built-in into an editable workspace copy (G0.1, generator spec §3.4). */
export function ForkButton({ typeId }: { typeId: string }) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    forkDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form specs-form--row">
      <input type="hidden" name="typeId" value={typeId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Forking…' : 'Fork to edit'}
      </Button>
      {state.error ? <span className="specs-grid__meta">{state.error}</span> : null}
    </form>
  );
}

/** Create a workspace Document Type from scratch (sections come with G0.2). */
export function CreateDocumentTypeForm() {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    createDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <TextField
        id="new-doc-type-name"
        name="name"
        label="New document type"
        placeholder="e.g. Service Bulletin"
        error={state.error}
      />
      <TextField
        id="new-doc-type-description"
        name="description"
        label="Description (optional)"
        placeholder="What kind of document this produces"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create document type'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Created.</p> : null}
    </form>
  );
}

/** Inline rename/re-describe for an editable workspace type. */
export function RenameDocumentTypeForm({
  typeId,
  currentName,
  currentDescription,
}: {
  typeId: string;
  currentName: string;
  currentDescription: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    renameDocumentTypeAction,
    {},
  );
  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Rename
      </Button>
    );
  }
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="typeId" value={typeId} />
      <TextField
        id={`rename-${typeId}`}
        name="name"
        label="Name"
        defaultValue={currentName}
        error={state.error}
      />
      <TextField
        id={`describe-${typeId}`}
        name="description"
        label="Description"
        defaultValue={currentDescription ?? ''}
      />
      <div className="specs-form--row">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state.done ? <p className="specs-grid__meta">Saved.</p> : null}
    </form>
  );
}

/** Archive / restore a workspace type (archive-over-delete, spec §3.8). */
export function ArchiveButton({
  typeId,
  archived,
}: {
  typeId: string;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState<DocumentTypeFormState, FormData>(
    archiveDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form--row">
      <input type="hidden" name="typeId" value={typeId} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {archived ? 'Restore' : 'Archive'}
      </Button>
      {state.error ? <span className="specs-grid__meta">{state.error}</span> : null}
    </form>
  );
}
