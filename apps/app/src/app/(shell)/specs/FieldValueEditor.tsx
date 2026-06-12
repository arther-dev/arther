'use client';

import { useActionState, useState } from 'react';
import type { OverrideRow, SpecFieldRow, UnitRow } from '@arther/db';
import { isOverridableFieldType } from '@arther/types';
import { Button } from '@arther/ui';
import {
  clearOverrideAction,
  setOverrideAction,
  updateFieldValueAction,
  type SpecsFormState,
} from './actions';

/**
 * Inline per-type value editors (F6.3) for the scalar family: scalar, range,
 * toleranced, boolean, enum, multi_enum. Table (mini-spreadsheet) and
 * reference (component picker) are their own slices. Stored values are always
 * in the chosen unit; display conversion follows with the unit-registry work.
 *
 * The same inputs serve two write paths (F6.4): Edit — the component's global
 * value, every product sees it — and Override — this product only, stored on
 * the product↔component edge (§3.5).
 */

/** Per-type form inputs, shared by the global editor and the override editor. */
function TypeInputs({
  field,
  units,
  current,
  idPrefix,
}: {
  field: SpecFieldRow;
  units: UnitRow[];
  current: Record<string, unknown> | null;
  idPrefix: string;
}) {
  const v = current;
  const unitSelect = (defaultUnit?: string) => (
    <>
      <label className="ui-field__label" htmlFor={`${idPrefix}-unit-${field.id}`}>
        Unit
      </label>
      <select
        id={`${idPrefix}-unit-${field.id}`}
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
      <label className="ui-field__label" htmlFor={`${idPrefix}-${name}-${field.id}`}>
        {label}
      </label>
      <input
        id={`${idPrefix}-${name}-${field.id}`}
        name={name}
        type="number"
        step="any"
        defaultValue={defaultValue ?? ''}
        className="ui-field__input specs-value-input"
      />
    </>
  );

  return (
    <>
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
          <label className="ui-field__label" htmlFor={`${idPrefix}-ttype-${field.id}`}>
            ± as
          </label>
          <select
            id={`${idPrefix}-ttype-${field.id}`}
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
          <label className="ui-field__label" htmlFor={`${idPrefix}-bool-${field.id}`}>
            Value
          </label>
          <select
            id={`${idPrefix}-bool-${field.id}`}
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
          <label className="ui-field__label" htmlFor={`${idPrefix}-enum-${field.id}`}>
            Value
          </label>
          <select
            id={`${idPrefix}-enum-${field.id}`}
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
    </>
  );
}

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

  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="fieldId" value={field.id} />
      <input type="hidden" name="type" value={field.type} />
      <TypeInputs
        field={field}
        units={units}
        current={field.value as Record<string, unknown> | null}
        idPrefix="g"
      />
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

/**
 * Override (product-specific) affordance for a shared component's field in a
 * product context. Saving writes to the edge, not the component; the global
 * value — and every other product — stays untouched.
 */
export function OverrideEditor({
  field,
  units,
  edgeId,
  override,
}: {
  field: SpecFieldRow;
  units: UnitRow[];
  edgeId: string;
  override: OverrideRow | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    async (prev, formData) => {
      const result = await setOverrideAction(prev, formData);
      if (!result.error) setEditing(false);
      return result;
    },
    {},
  );
  const [clearState, clearAction, clearPending] = useActionState<SpecsFormState, FormData>(
    clearOverrideAction,
    {},
  );

  if (!isOverridableFieldType(field.type)) return null;

  if (!editing) {
    return (
      <span className="specs-form--row">
        <button
          type="button"
          className="specs-value-button"
          aria-label={`Override ${field.name} for this product`}
          onClick={() => setEditing(true)}
        >
          {override ? 'Edit override' : 'Override'}
        </button>
        {override ? (
          <form action={clearAction} className="specs-form--inline">
            <input type="hidden" name="productComponentId" value={edgeId} />
            <input type="hidden" name="fieldId" value={field.id} />
            <button
              type="submit"
              className="specs-value-button"
              aria-label={`Remove the ${field.name} override`}
              disabled={clearPending}
            >
              {clearPending ? 'Removing…' : 'Remove override'}
            </button>
            {clearState.error ? <p className="ui-field__error">{clearState.error}</p> : null}
          </form>
        ) : null}
      </span>
    );
  }

  return (
    <form action={action} className="specs-form specs-form--row" noValidate>
      <input type="hidden" name="productComponentId" value={edgeId} />
      <input type="hidden" name="fieldId" value={field.id} />
      <input type="hidden" name="type" value={field.type} />
      <TypeInputs
        field={field}
        units={units}
        current={(override?.value ?? field.value) as Record<string, unknown> | null}
        idPrefix={`o-${edgeId.slice(0, 8)}`}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save override'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </form>
  );
}
