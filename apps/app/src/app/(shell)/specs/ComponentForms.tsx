'use client';

import { useActionState } from 'react';
import type { ComponentRow } from '@arther/db';
import { Button, TextField } from '@arther/ui';
import { attachComponentAction, createComponentAction, type SpecsFormState } from './actions';

export function NewComponentForm() {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    createComponentAction,
    {},
  );
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <TextField
        id="new-component-name"
        name="name"
        label="New component"
        placeholder="NEMA 23 Stator"
        error={state.error}
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="new-component-type">
          Kind
        </label>
        <select id="new-component-type" name="componentType" className="ui-field__input" defaultValue="part">
          <option value="part">part</option>
          <option value="module">module</option>
          <option value="assembly">assembly</option>
        </select>
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Adding…' : 'Add component'}
      </Button>
    </form>
  );
}

/** Attach an existing library component to a product (a graph edge, F5.3). */
export function AttachComponentForm({
  productId,
  components,
}: {
  productId: string;
  components: ComponentRow[];
}) {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    attachComponentAction,
    {},
  );
  if (components.length === 0) return null;
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="productId" value={productId} />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="attach-component">
          Add component
        </label>
        <select id="attach-component" name="componentId" className="ui-field__input" defaultValue="">
          <option value="" disabled>
            From the library…
          </option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="attach-quantity">
          Qty
        </label>
        <input
          id="attach-quantity"
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          className="ui-field__input specs-value-input"
        />
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Attaching…' : 'Attach'}
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
