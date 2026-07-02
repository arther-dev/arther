'use client';

import { useActionState, useRef, useState } from 'react';
import type { OverrideRow, SpecFieldRow, UnitRow } from '@arther/db';
import {
  convertUnitAmount,
  convertUnitDelta,
  describeFieldChangeImpact,
  listImpactedDocuments,
} from '@arther/types';
import { Button } from '@arther/ui';
import {
  clearOverrideAction,
  setOverrideAction,
  updateFieldValueAction,
  type SpecsFormState,
} from './actions';
import { TableEditor } from './TableEditor';

export interface ComponentOption {
  id: string;
  name: string;
}

/**
 * Inline per-type value editors (F6.3) for the scalar family: scalar, range,
 * toleranced, boolean, enum, multi_enum. Table (mini-spreadsheet) and
 * reference (component picker) are their own slices. Stored values are always
 * in the chosen unit; switching the unit converts the numbers being edited
 * through the registry (F6 acceptance, §3.6).
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
  const initialUnitId = ((v?.unit_id as string | undefined) ?? field.unit_id ?? '') as string;
  const fromUnitRef = useRef(initialUnitId);

  // F6 — switching the unit converts the value in the form. The inputs are
  // uncontrolled (the DOM is the draft state), so rewrite them in place from
  // the previously selected unit to the picked one. A cross-dimension pick
  // (or a unit missing a usable factor) converts nothing and just relabels,
  // preserving the escape hatch for fixing a wrong-dimension unit.
  const convertDraftInputs = (nextUnitId: string) => {
    const from = units.find((u) => u.id === fromUnitRef.current);
    fromUnitRef.current = nextUnitId;
    const to = units.find((u) => u.id === nextUnitId);
    if (!from || !to || from.id === to.id) return;
    const rewrite = (name: string, delta = false) => {
      const el = document.getElementById(
        `${idPrefix}-${name}-${field.id}`,
      ) as HTMLInputElement | null;
      if (!el || el.value.trim() === '') return;
      const amount = Number(el.value);
      if (!Number.isFinite(amount)) return;
      const converted = delta ? convertUnitDelta(amount, from, to) : convertUnitAmount(amount, from, to);
      if (converted !== null) el.value = String(converted);
    };
    if (field.type === 'scalar') rewrite('value');
    if (field.type === 'range') {
      rewrite('min');
      rewrite('max');
    }
    if (field.type === 'toleranced') {
      rewrite('nominal');
      const toleranceType = document.getElementById(
        `${idPrefix}-ttype-${field.id}`,
      ) as HTMLSelectElement | null;
      // A percentage tolerance is relative — only absolute tolerances convert.
      if (toleranceType?.value === 'absolute') rewrite('tolerance', true);
    }
  };

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
        onChange={(e) => convertDraftInputs(e.target.value)}
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

/**
 * G6.6 — the shared save footer for the global value editors. When the action
 * reports an impact (a value change that ripples into the documents citing the
 * field), it swaps to a confirm: the blast-radius line, a `confirmed` flag, and
 * an "Apply change" button. Zero-impact saves never see this — they commit on
 * the first submit. The hidden `impactCheck` opts these forms into the check
 * (the table editor saves directly, without it).
 */
function ValueEditorFooter({
  state,
  pending,
  onCancel,
}: {
  state: SpecsFormState;
  pending: boolean;
  onCancel: () => void;
}) {
  const impact = state.impact;
  return (
    <>
      <input type="hidden" name="impactCheck" value="true" />
      {impact ? (
        <>
          <input type="hidden" name="confirmed" value="true" />
          <p className="specs-grid__meta" role="status">
            {describeFieldChangeImpact(impact)}
            {impact.documentTitles.length > 0 ? ` Affected: ${listImpactedDocuments(impact)}.` : ''}
          </p>
        </>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : impact ? 'Apply change' : 'Save'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
    </>
  );
}

export function FieldValueEditor({
  field,
  units,
  components = [],
}: {
  field: SpecFieldRow;
  units: UnitRow[];
  components?: ComponentOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    async (prev, formData) => {
      const result = await updateFieldValueAction(prev, formData);
      // A confirm step (result.impact) keeps the editor open; only a committed
      // save (no error, no pending impact) closes it.
      if (!result.error && !result.impact) setEditing(false);
      return result;
    },
    {},
  );

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

  if (field.type === 'table') {
    return <TableEditor field={field} units={units} onClose={() => setEditing(false)} />;
  }

  if (field.type === 'reference') {
    // §5.5: select over the Component Library; a component never references
    // itself (the F5.9 cycle check would reject it anyway).
    const candidates = components.filter((c) => c.id !== field.component_id);
    return (
      <form action={action} className="specs-form specs-form--row" noValidate>
        <input type="hidden" name="fieldId" value={field.id} />
        <input type="hidden" name="type" value="reference" />
        <label className="ui-field__label" htmlFor={`ref-${field.id}`}>
          Component
        </label>
        <select
          id={`ref-${field.id}`}
          name="componentId"
          className="ui-field__input"
          defaultValue={(field.value as { component_id?: string } | null)?.component_id ?? ''}
        >
          <option value="" disabled>
            Select…
          </option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {candidates.length === 0 ? (
          <p className="specs-grid__meta">No other components in the library yet.</p>
        ) : null}
        <ValueEditorFooter state={state} pending={pending} onCancel={() => setEditing(false)} />
      </form>
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
      <ValueEditorFooter state={state} pending={pending} onCancel={() => setEditing(false)} />
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
