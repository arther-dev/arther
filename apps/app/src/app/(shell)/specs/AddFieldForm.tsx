'use client';

import { useActionState, useState } from 'react';
import { fieldTypeSchema } from '@arther/types';
import { Button, TextField } from '@arther/ui';
import { createFieldAction, type SpecsFormState } from './actions';

export function AddFieldForm({
  ownerKind,
  ownerId,
  categories,
}: {
  ownerKind: 'product' | 'component';
  ownerId: string;
  categories: string[];
}) {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(createFieldAction, {});
  const [type, setType] = useState('scalar');
  const needsOptions = type === 'enum' || type === 'multi_enum';
  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="ownerKind" value={ownerKind} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <TextField
        id={`field-name-${ownerId}`}
        name="name"
        label="Field name"
        placeholder="Rated voltage"
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={`field-type-${ownerId}`}>
          Type
        </label>
        <select
          id={`field-type-${ownerId}`}
          name="type"
          className="ui-field__input"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {fieldTypeSchema.options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {needsOptions ? (
        <TextField
          id={`field-options-${ownerId}`}
          name="options"
          label="Options"
          placeholder="IP65, IP67, IP68"
          hint="Comma-separated; shared across all products using this field."
        />
      ) : null}
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={`field-category-${ownerId}`}>
          Category
        </label>
        <select id={`field-category-${ownerId}`} name="category" className="ui-field__input">
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending} data-arther-spotlight="add-field">
        {pending ? 'Adding…' : 'Add field'}
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
