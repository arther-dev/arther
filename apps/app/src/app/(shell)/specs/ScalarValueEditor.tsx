'use client';

import { useActionState, useState } from 'react';
import type { SpecFieldRow, UnitRow } from '@arther/db';
import { Button } from '@arther/ui';
import { updateScalarValueAction, type SpecsFormState } from './actions';

/**
 * Inline scalar editor (F6.3, first of the 8 per-type editors). The stored
 * value is always in the chosen unit (display conversion comes with the unit
 * registry work).
 */
export function ScalarValueEditor({ field, units }: { field: SpecFieldRow; units: UnitRow[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    async (prev, formData) => {
      const result = await updateScalarValueAction(prev, formData);
      if (!result.error) setEditing(false);
      return result;
    },
    {},
  );

  const current = field.value as { value: number; unit_id: string } | null;

  if (!editing) {
    return (
      <button
        type="button"
        className="specs-value-button"
        aria-label={`Edit ${field.name}`}
        onClick={() => setEditing(true)}
      >
        Edit
      </button>
    );
  }

  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="fieldId" value={field.id} />
      <label className="ui-field__label" htmlFor={`value-${field.id}`}>
        Value
      </label>
      <input
        id={`value-${field.id}`}
        name="value"
        type="number"
        step="any"
        defaultValue={current?.value ?? ''}
        className="ui-field__input specs-value-input"
      />
      <label className="ui-field__label" htmlFor={`unit-${field.id}`}>
        Unit
      </label>
      <select
        id={`unit-${field.id}`}
        name="unitId"
        className="ui-field__input"
        defaultValue={current?.unit_id ?? field.unit_id ?? ''}
      >
        <option value="" disabled>
          Unit…
        </option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.symbol}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
