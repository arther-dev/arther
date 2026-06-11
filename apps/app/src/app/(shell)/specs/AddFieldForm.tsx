'use client';

import { useActionState } from 'react';
import { fieldTypeSchema } from '@arther/types';
import { Button, TextField } from '@arther/ui';
import { createFieldAction, type SpecsFormState } from './actions';

export function AddFieldForm({
  productId,
  categories,
}: {
  productId: string;
  categories: string[];
}) {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(createFieldAction, {});
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="productId" value={productId} />
      <TextField id="field-name" name="name" label="Field name" placeholder="Rated voltage" />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="field-type">
          Type
        </label>
        <select id="field-type" name="type" className="ui-field__input" defaultValue="scalar">
          {fieldTypeSchema.options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="field-category">
          Category
        </label>
        <select id="field-category" name="category" className="ui-field__input">
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Adding…' : 'Add field'}
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
