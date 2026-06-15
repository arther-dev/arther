'use client';

import { useActionState } from 'react';
import type { DocumentTypeRow, DocumentTypeSectionRow } from '@arther/db';
import { Button, TextField } from '@arther/ui';
import {
  addSectionAction,
  archiveDocumentTypeAction,
  createDocumentTypeAction,
  deleteSectionAction,
  forkDocumentTypeAction,
  moveSectionAction,
  renameDocumentTypeAction,
  updateSectionAction,
  type DocTypeFormState,
} from './actions';

export function CreateDocumentTypeForm() {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    createDocumentTypeAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <h3 className="specs-section__title">Create a Document Type</h3>
      <TextField id="new-doctype-name" name="name" label="Name" error={state.error} />
      <TextField
        id="new-doctype-description"
        name="description"
        label="Description (optional)"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Created.</p> : null}
    </form>
  );
}

export function ForkButton({ sourceId }: { sourceId: string }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    forkDocumentTypeAction,
    {},
  );
  return (
    <form action={action}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Forking…' : 'Fork to edit'}
      </Button>
      {state.error ? <span className="specs-grid__meta"> {state.error}</span> : null}
    </form>
  );
}

export function WorkspaceDocumentType({
  type,
  canManage,
}: {
  type: DocumentTypeRow;
  canManage: boolean;
}) {
  const sections = [...type.sections].sort((a, b) => a.display_order - b.display_order);
  return (
    <article className="specs-section" aria-label={`Document Type: ${type.name}`}>
      {canManage ? (
        <RenameForm type={type} />
      ) : (
        <h3 className="specs-section__title">{type.name}</h3>
      )}
      {type.forked_from ? (
        <p className="specs-grid__meta">Forked from a built-in — edit freely.</p>
      ) : null}

      <h4 className="specs-grid__meta">Sections (categories → section)</h4>
      {sections.length === 0 ? (
        <p className="specs-grid__meta">No sections yet.</p>
      ) : (
        <ul className="specs-form" aria-label="Sections">
          {sections.map((section, i) => (
            <SectionRow
              key={section.id}
              documentTypeId={type.id}
              section={section}
              canManage={canManage}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
            />
          ))}
        </ul>
      )}

      {canManage ? <AddSectionForm documentTypeId={type.id} /> : null}
    </article>
  );
}

function RenameForm({ type }: { type: DocumentTypeRow }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    renameDocumentTypeAction,
    {},
  );
  const [archiveState, archiveAction, archivePending] = useActionState<DocTypeFormState, FormData>(
    archiveDocumentTypeAction,
    {},
  );
  return (
    <div className="specs-form specs-form--row">
      <form action={action} className="specs-form specs-form--row" noValidate>
        <input type="hidden" name="id" value={type.id} />
        <TextField
          id={`doctype-name-${type.id}`}
          name="name"
          label="Name"
          defaultValue={type.name}
          error={state.error}
        />
        <TextField
          id={`doctype-desc-${type.id}`}
          name="description"
          label="Description"
          defaultValue={type.description ?? ''}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {state.done ? <span className="specs-grid__meta">Saved.</span> : null}
      </form>
      <form
        action={archiveAction}
        onSubmit={(e) => {
          if (!confirm(`Archive “${type.name}”? Existing documents keep their type.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={type.id} />
        <Button type="submit" size="sm" variant="secondary" disabled={archivePending}>
          {archivePending ? 'Archiving…' : 'Archive'}
        </Button>
        {archiveState.error ? (
          <span className="specs-grid__meta"> {archiveState.error}</span>
        ) : null}
      </form>
    </div>
  );
}

function SectionRow({
  documentTypeId,
  section,
  canManage,
  isFirst,
  isLast,
}: {
  documentTypeId: string;
  section: DocumentTypeSectionRow;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(
    updateSectionAction,
    {},
  );
  const [, deleteAction, deletePending] = useActionState<DocTypeFormState, FormData>(
    deleteSectionAction,
    {},
  );
  const [, moveAction] = useActionState<DocTypeFormState, FormData>(moveSectionAction, {});

  if (!canManage) {
    return (
      <li className="specs-release">
        <strong>{section.name}</strong>
        {section.spec_field_categories.length > 0 ? (
          <span className="specs-grid__meta"> · {section.spec_field_categories.join(', ')}</span>
        ) : null}
        {section.brief_required ? <span className="specs-release__tag">brief required</span> : null}
      </li>
    );
  }

  return (
    <li className="specs-release">
      <form action={action} className="specs-form specs-form--row" noValidate>
        <input type="hidden" name="id" value={section.id} />
        <TextField
          id={`section-name-${section.id}`}
          name="name"
          label="Section"
          defaultValue={section.name}
          error={state.error}
        />
        <TextField
          id={`section-cats-${section.id}`}
          name="categories"
          label="Spec categories (comma-separated)"
          defaultValue={section.spec_field_categories.join(', ')}
        />
        <label className="specs-grid__meta">
          <input type="checkbox" name="briefRequired" defaultChecked={section.brief_required} />
          Brief required
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {state.done ? <span className="specs-grid__meta">Saved.</span> : null}
      </form>
      <div className="specs-form specs-form--row">
        <form action={moveAction}>
          <input type="hidden" name="documentTypeId" value={documentTypeId} />
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="direction" value="up" />
          <Button type="submit" size="sm" variant="secondary" disabled={isFirst} aria-label="Move section up">
            ↑
          </Button>
        </form>
        <form action={moveAction}>
          <input type="hidden" name="documentTypeId" value={documentTypeId} />
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="direction" value="down" />
          <Button type="submit" size="sm" variant="secondary" disabled={isLast} aria-label="Move section down">
            ↓
          </Button>
        </form>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(`Remove the “${section.name}” section?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={section.id} />
          <Button type="submit" size="sm" variant="secondary" disabled={deletePending}>
            Remove
          </Button>
        </form>
      </div>
    </li>
  );
}

function AddSectionForm({ documentTypeId }: { documentTypeId: string }) {
  const [state, action, pending] = useActionState<DocTypeFormState, FormData>(addSectionAction, {});
  return (
    <form action={action} className="specs-form" noValidate>
      <h4 className="specs-grid__meta">Add a section</h4>
      <input type="hidden" name="documentTypeId" value={documentTypeId} />
      <TextField id={`add-section-name-${documentTypeId}`} name="name" label="Section name" error={state.error} />
      <TextField
        id={`add-section-cats-${documentTypeId}`}
        name="categories"
        label="Spec categories (comma-separated)"
      />
      <label className="specs-grid__meta">
        <input type="checkbox" name="briefRequired" />
        Brief required
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Adding…' : 'Add section'}
      </Button>
      {state.done ? <p className="specs-grid__meta">Added.</p> : null}
    </form>
  );
}
