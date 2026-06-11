'use client';

import { useActionState, useState } from 'react';
import type { SpecFieldRow, UnitRow } from '@arther/db';
import { Button } from '@arther/ui';
import { updateFieldValueAction, type SpecsFormState } from './actions';

/**
 * Inline per-type value editors (F6.3) for the scalar family: scalar, range,
 * toleranced, boolean, enum, multi_enum. Table (mini-spreadsheet) and
 * reference (component picker) are their own slices. Stored values are always
 * in the chosen unit; display conversion follows with the unit-registry work.
 */
export function FieldValueEditor({ field, units }: { field: SpecFieldRow; units: UnitRow[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    async (prev, formData) => {
      const result = await updateFieldValueAction(prev, formData);
      if (!result.error) setEditing(false);
      return result;
    },
    {},
  );

  if (field.type === 'table' || field.type === 'reference') {
    return <span className="specs-grid__meta">editor soon</span>;
  }

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

  const v = field.value as Record<string, unknown> | null;
  const unitSelect = (defaultUnit?: string) => (
    <>
      <label className="ui-field__label" htmlFor={`unit-${field.id}`}>
        Unit
      </label>
      <select
        id={`unit-${field.id}`}
        name="unitId"
        className="ui-field__input"
        defaultValue={defaultUnit ?? field.unit_id ?? ''}
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
    </>
  );
  const num = (name: string, label: string, defaultValue?: number) => (
    <>
      <label className="ui-field__label" htmlFor={`${name}-${field.id}`}>
        {label}
      </label>
      <input
        id={`${name}-${field.id}`}
        name={name}
        type="number"
        step="any"
        defaultValue={defaultValue ?? ''}
        className="ui-field__input specs-value-input"
      />
    </>
  );

  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="fieldId" value={field.id} />
      <input type="hidden" name="type" value={field.type} />

      {field.type === 'scalar' && (
        <>
          {num('value', 'Value', v?.value as number | undefined)}
          {unitSelect(v?.unit_id as string | undefined)}
        </>
      )}

      {field.type === 'range' && (
        <>
          {num('min', 'Min', v?.min as number | undefined)}
          {num('max', 'Max', v?.max as number | undefined)}
          {unitSelect(v?.unit_id as string | undefined)}
        </>
      )}

      {field.type === 'toleranced' && (
        <>
          {num('nominal', 'Nominal', v?.nominal as number | undefined)}
          {num('tolerance', 'Tolerance', v?.tolerance as number | undefined)}
          <label className="ui-field__label" htmlFor={`ttype-${field.id}`}>
            ± as
          </label>
          <select
            id={`ttype-${field.id}`}
            name="toleranceType"
            className="ui-field__input"
            defaultValue={(v?.tolerance_type as string) ?? 'percentage'}
          >
            <option value="percentage">%</option>
            <option value="absolute">absolute</option>
          </select>
          {unitSelect(v?.unit_id as string | undefined)}
        </>
      )}

      {field.type === 'boolean' && (
        <>
          <label className="ui-field__label" htmlFor={`bool-${field.id}`}>
            Value
          </label>
          <select
            id={`bool-${field.id}`}
            name="value"
            className="ui-field__input"
            defaultValue={v ? String(v.value) : 'true'}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </>
      )}

      {field.type === 'enum' && (
        <>
          <label className="ui-field__label" htmlFor={`enum-${field.id}`}>
            Value
          </label>
          <select
            id={`enum-${field.id}`}
            name="selected"
            className="ui-field__input"
            defaultValue={(v?.selected as string) ?? ''}
          >
            <option value="" disabled>
              Select…
            </option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </>
      )}

      {field.type === 'multi_enum' && (
        <fieldset className="specs-checks">
          <legend className="ui-field__label">Values</legend>
          {(field.options ?? []).map((o) => (
            <label key={o} className="specs-checks__item">
              <input
                type="checkbox"
                name="selected"
                value={o}
                defaultChecked={Array.isArray(v?.selected) && (v.selected as string[]).includes(o)}
              />
              {o}
            </label>
          ))}
        </fieldset>
      )}

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
