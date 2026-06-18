'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FieldType } from '@arther/types';
import { Button } from '@arther/ui';
import { addVariantDeltaAction, removeVariantDeltaAction } from '../actions';

export interface EditorField {
  fieldId: string;
  name: string;
  type: FieldType;
  unitId: string | null;
  options: string[] | null;
  overridable: boolean;
}
export interface EditorComponent {
  componentId: string;
  componentName: string;
  fields: EditorField[];
}
export interface EditorDelta {
  id: string;
  type: string;
  label: string;
}
export interface EditorUnit {
  id: string;
  symbol: string;
}
export interface LibraryComponent {
  id: string;
  name: string;
}

/** Build a typed FieldValue from the override form's raw inputs (validated server-side). */
function buildValue(
  type: FieldType,
  raw: Record<string, string>,
  options: string[] | null,
): Record<string, unknown> | null {
  switch (type) {
    case 'scalar':
      return { value: Number(raw.value), unit_id: raw.unitId };
    case 'range':
      return { min: Number(raw.min), max: Number(raw.max), unit_id: raw.unitId };
    case 'toleranced':
      return {
        nominal: Number(raw.nominal),
        tolerance: Number(raw.tolerance),
        tolerance_type: raw.toleranceType || 'percentage',
        unit_id: raw.unitId,
      };
    case 'boolean':
      return { value: raw.value === 'true' };
    case 'enum':
      return { selected: raw.selected, options: options ?? [] };
    default:
      return null;
  }
}

function OverrideForm({
  componentId,
  field,
  units,
  variantId,
  onDone,
}: {
  componentId: string;
  field: EditorField;
  units: EditorUnit[];
  variantId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState<Record<string, string>>({
    unitId: field.unitId ?? units[0]?.id ?? '',
    toleranceType: 'percentage',
    value: field.type === 'boolean' ? 'true' : '',
    selected: field.options?.[0] ?? '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setRaw((p) => ({ ...p, [k]: v }));

  const numberInput = (key: string, label: string) => (
    <label className="ui-field" style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span className="ui-field__label">{label}</span>
      <input
        className="ui-field__input specs-value-input"
        type="number"
        step="any"
        value={raw[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const unitSelect = (
    <label className="ui-field" style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span className="ui-field__label">Unit</span>
      <select className="ui-field__input" value={raw.unitId} onChange={(e) => set('unitId', e.target.value)}>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.symbol}
          </option>
        ))}
      </select>
    </label>
  );

  async function submit() {
    const value = buildValue(field.type, raw, field.options);
    if (!value) {
      setError('This field type can’t be overridden.');
      return;
    }
    setPending(true);
    setError(null);
    const res = await addVariantDeltaAction(variantId, {
      type: 'SCALAR_OVERRIDE',
      componentId,
      fieldId: field.fieldId,
      overrideValue: value,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not add the override.');
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <div className="specs-form--row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {field.type === 'scalar' ? (
        <>
          {numberInput('value', 'Value')}
          {unitSelect}
        </>
      ) : null}
      {field.type === 'range' ? (
        <>
          {numberInput('min', 'Min')}
          {numberInput('max', 'Max')}
          {unitSelect}
        </>
      ) : null}
      {field.type === 'toleranced' ? (
        <>
          {numberInput('nominal', 'Nominal')}
          {numberInput('tolerance', 'Tolerance')}
          <label className="ui-field" style={{ display: 'inline-flex', flexDirection: 'column' }}>
            <span className="ui-field__label">± as</span>
            <select
              className="ui-field__input"
              value={raw.toleranceType}
              onChange={(e) => set('toleranceType', e.target.value)}
            >
              <option value="percentage">%</option>
              <option value="absolute">absolute</option>
            </select>
          </label>
          {unitSelect}
        </>
      ) : null}
      {field.type === 'boolean' ? (
        <label className="ui-field" style={{ display: 'inline-flex', flexDirection: 'column' }}>
          <span className="ui-field__label">Value</span>
          <select className="ui-field__input" value={raw.value} onChange={(e) => set('value', e.target.value)}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      ) : null}
      {field.type === 'enum' ? (
        <label className="ui-field" style={{ display: 'inline-flex', flexDirection: 'column' }}>
          <span className="ui-field__label">Value</span>
          <select
            className="ui-field__input"
            value={raw.selected}
            onChange={(e) => set('selected', e.target.value)}
          >
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button size="sm" variant="primary" onClick={submit} disabled={pending}>
        {pending ? 'Saving…' : 'Save override'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
        Cancel
      </Button>
      {error ? <span className="ui-field__error">{error}</span> : null}
    </div>
  );
}

/**
 * V.3 — the variant delta editor (Product Variants §4.2). The base product's spec
 * is the reference; each affordance expresses a departure as a delta:
 *  • override an (overridable) field value → SCALAR_OVERRIDE
 *  • swap a base component for a library one → COMPONENT_SWAP
 *  • remove a base component → COMPONENT_REMOVE
 *  • add a library component → COMPONENT_ADD
 * The resolved-spec preview (V.2) re-renders on each change via `router.refresh()`.
 */
export function DeltaEditor({
  variantId,
  components,
  library,
  units,
  deltas,
}: {
  variantId: string;
  components: EditorComponent[];
  library: LibraryComponent[];
  units: EditorUnit[];
  deltas: EditorDelta[];
}) {
  const router = useRouter();
  const [openField, setOpenField] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [addId, setAddId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const res = await action();
    if (!res.ok) {
      setError(res.error ?? 'Action failed.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {error ? <p className="ui-field__error">{error}</p> : null}

      <section className="specs-section">
        <h2 className="specs-section__title">Base components</h2>
        {components.length === 0 ? (
          <p className="specs-grid__meta">This product has no components to vary.</p>
        ) : (
          <ul className="specs-form" aria-label="Base components">
            {components.map((c) => (
              <li key={c.componentId} className="specs-release" style={{ display: 'block' }}>
                <div className="specs-form--row" style={{ gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{c.componentName}</span>
                  <span style={{ flex: 1 }} />
                  {swapFor === c.componentId ? (
                    <span className="specs-form--row" style={{ gap: 6 }}>
                      <select
                        aria-label="Replacement component"
                        className="ui-field__input"
                        defaultValue=""
                        onChange={(e) => {
                          const replacementComponentId = e.target.value;
                          if (replacementComponentId) {
                            void run(() =>
                              addVariantDeltaAction(variantId, {
                                type: 'COMPONENT_SWAP',
                                componentId: c.componentId,
                                replacementComponentId,
                              }),
                            );
                            setSwapFor(null);
                          }
                        }}
                      >
                        <option value="" disabled>
                          Replace with…
                        </option>
                        {library
                          .filter((l) => l.id !== c.componentId)
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                      </select>
                      <Button size="sm" variant="ghost" onClick={() => setSwapFor(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setSwapFor(c.componentId)}>
                        Swap
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(() =>
                            addVariantDeltaAction(variantId, {
                              type: 'COMPONENT_REMOVE',
                              componentId: c.componentId,
                            }),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
                <ul className="specs-form" style={{ marginTop: 4 }}>
                  {c.fields.map((f) => (
                    <li key={f.fieldId} className="specs-form--row" style={{ gap: 8, alignItems: 'center' }}>
                      <span>{f.name}</span>
                      <span className="specs-grid__meta">{f.type}</span>
                      <span style={{ flex: 1 }} />
                      {f.overridable ? (
                        openField === f.fieldId ? (
                          <OverrideForm
                            componentId={c.componentId}
                            field={f}
                            units={units}
                            variantId={variantId}
                            onDone={() => setOpenField(null)}
                          />
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setOpenField(f.fieldId)}>
                            Override
                          </Button>
                        )
                      ) : (
                        <span className="specs-grid__meta" title="Only scalar-family fields can be overridden.">
                          —
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="specs-section">
        <h2 className="specs-section__title">Add a component</h2>
        <div className="specs-form--row" style={{ gap: 6 }}>
          <select
            aria-label="Component to add"
            className="ui-field__input"
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
          >
            <option value="">Choose from the library…</option>
            {library.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!addId}
            onClick={() => {
              void run(() =>
                addVariantDeltaAction(variantId, { type: 'COMPONENT_ADD', newComponentId: addId }),
              );
              setAddId('');
            }}
          >
            Add
          </Button>
        </div>
      </section>

      <section className="specs-section">
        <h2 className="specs-section__title">Deltas ({deltas.length})</h2>
        {deltas.length === 0 ? (
          <p className="specs-grid__meta">
            No deltas yet — this variant resolves identically to the base product.
          </p>
        ) : (
          <ul className="specs-form" aria-label="Deltas">
            {deltas.map((d) => (
              <li key={d.id} className="specs-release" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="specs-release__tag">{d.type}</span>
                <span>{d.label}</span>
                <span style={{ flex: 1 }} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => run(() => removeVariantDeltaAction(variantId, d.id))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
