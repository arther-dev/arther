'use client';

import { useActionState, useState } from 'react';
import type { DocumentTypeSectionRow } from '@arther/db';
import { BLOCK_TYPES, STANDARD_BRIEF_FRAGMENT_KEYS, type BlockType } from '@arther/types';
import { Button, TextField } from '@arther/ui';
import {
  archiveDocumentTypeAction,
  createDocumentTypeAction,
  deleteSectionAction,
  forkDocumentTypeAction,
  moveSectionAction,
  renameDocumentTypeAction,
  saveSectionAction,
  type DocTypeFormState,
} from './actions';

export function CreateDocumentTypeForm() {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    createDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <TextField id="dt-name" name="name" label="New document type" placeholder="Test Report" error={state.error} />
      <TextField id="dt-desc" name="description" label="Description (optional)" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create from scratch'}
      </Button>
    </form>
  );
}

export function ForkButton({ sourceId, label = 'Fork to customise' }: { sourceId: string; label?: string }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    forkDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="sourceId" value={sourceId} />
      <button type="submit" className="specs-value-button" disabled={pending}>
        {pending ? 'Forking…' : label}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

export function RenameDocumentTypeForm({
  id,
  name,
  description,
}: {
  id: string;
  name: string;
  description: string | null;
}) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    renameDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="id" value={id} />
      <TextField id="rename-name" name="name" label="Name" defaultValue={name} error={state.error} />
      <TextField
        id="rename-desc"
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
        if (
          !archived &&
          !window.confirm('Archive this document type? New documents can’t use it, but existing ones are untouched.')
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      <Button type="submit" size="sm" variant={archived ? 'secondary' : 'danger'} disabled={pending}>
        {pending ? 'Saving…' : archived ? 'Restore' : 'Archive'}
      </Button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

/**
 * The bounded structural section editor (§7 Q2): name, category→section map,
 * brief-fragment keys, brief-required toggle, and the default block types. Used
 * for both adding a section and editing an existing one.
 */
export function SectionEditor({
  documentTypeId,
  section,
  onDone,
}: {
  documentTypeId: string;
  section?: DocumentTypeSectionRow;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    async (prev, formData) => {
      const result = await saveSectionAction(prev, formData);
      if (result.done) onDone?.();
      return result;
    },
    {},
  );
  const selected = new Set<BlockType>((section?.default_block_types ?? []) as BlockType[]);
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="documentTypeId" value={documentTypeId} />
      {section ? <input type="hidden" name="sectionId" value={section.id} /> : null}
      <TextField
        id={`sec-name-${section?.id ?? 'new'}`}
        name="name"
        label="Section name"
        defaultValue={section?.name ?? ''}
        error={state.error}
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={`sec-cats-${section?.id ?? 'new'}`}>
          Spec field categories (comma-separated)
        </label>
        <input
          id={`sec-cats-${section?.id ?? 'new'}`}
          name="categories"
          className="ui-field__input"
          defaultValue={(section?.spec_field_categories ?? []).join(', ')}
          placeholder="Electrical, Mechanical"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={`sec-keys-${section?.id ?? 'new'}`}>
          Brief fragment keys (comma-separated)
        </label>
        <input
          id={`sec-keys-${section?.id ?? 'new'}`}
          name="briefKeys"
          className="ui-field__input"
          defaultValue={(section?.brief_fragment_keys ?? []).join(', ')}
          placeholder="overview, target_applications"
          list="brief-key-suggestions"
        />
        <datalist id="brief-key-suggestions">
          {STANDARD_BRIEF_FRAGMENT_KEYS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </div>
      <label className="ui-field__checkbox">
        <input type="checkbox" name="briefRequired" defaultChecked={section?.brief_required ?? false} />
        Brief required — generates a placeholder when the fragment is missing (otherwise the section
        is omitted)
      </label>
      <fieldset className="specs-blocktype-grid">
        <legend className="ui-field__label">Default block types</legend>
        {BLOCK_TYPES.map((bt) => (
          <label key={bt} className="ui-field__checkbox">
            <input type="checkbox" name="blockTypes" value={bt} defaultChecked={selected.has(bt)} />
            {bt}
          </label>
        ))}
      </fieldset>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : section ? 'Save section' : 'Add section'}
      </Button>
    </form>
  );
}

export function SectionRowControls({
  documentTypeId,
  section,
  isFirst,
  isLast,
}: {
  documentTypeId: string;
  section: DocumentTypeSectionRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [moveState, moveAction] = useActionState<DocTypeFormState, FormData>(moveSectionAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState<DocTypeFormState, FormData>(
    deleteSectionAction,
    {},
  );
  return (
    <>
      <div className="specs-form--row">
        <form action={moveAction} className="specs-form--inline">
          <input type="hidden" name="documentTypeId" value={documentTypeId} />
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" className="specs-value-button" aria-label="Move up" disabled={isFirst}>
            ↑
          </button>
        </form>
        <form action={moveAction} className="specs-form--inline">
          <input type="hidden" name="documentTypeId" value={documentTypeId} />
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" className="specs-value-button" aria-label="Move down" disabled={isLast}>
            ↓
          </button>
        </form>
        <button type="button" className="specs-value-button" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close' : 'Edit'}
        </button>
        <form
          action={deleteAction}
          className="specs-form--inline"
          onSubmit={(e) => {
            if (!window.confirm(`Delete the “${section.name}” section?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="sectionId" value={section.id} />
          <button type="submit" className="specs-value-button" disabled={deletePending} aria-label={`Delete ${section.name}`}>
            {deletePending ? 'Deleting…' : 'Delete'}
          </button>
        </form>
      </div>
      {moveState.error ? <span className="ui-field__error">{moveState.error}</span> : null}
      {deleteState.error ? <span className="ui-field__error">{deleteState.error}</span> : null}
      {editing ? (
        <SectionEditor
          documentTypeId={documentTypeId}
          section={section}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

export function AddSectionDisclosure({ documentTypeId }: { documentTypeId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="specs-value-button" onClick={() => setOpen(true)}>
        + Add section
      </button>
    );
  }
  return (
    <div className="specs-section">
      <h3 className="specs-section__title">New section</h3>
      <SectionEditor documentTypeId={documentTypeId} onDone={() => setOpen(false)} />
    </div>
  );
}
