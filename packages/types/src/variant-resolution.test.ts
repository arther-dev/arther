import { describe, expect, it } from 'vitest';
import {
  resolveVariantSpec,
  type ResolvedSpecEntry,
  type VariantDeltaForResolution,
} from './variant-resolution';

function entry(over: Partial<ResolvedSpecEntry> & { fieldId: string; name: string }): ResolvedSpecEntry {
  return {
    category: 'General',
    type: 'scalar',
    value: null,
    unitId: null,
    currentVersionId: null,
    owner: 'component',
    componentId: null,
    componentName: null,
    origin: 'base',
    overridden: false,
    ...over,
  };
}

// Base: a product-level field + two components (PSU with one field, FAN with one).
const base: ResolvedSpecEntry[] = [
  entry({ fieldId: 'p1', name: 'Weight', owner: 'product', componentId: null, componentName: null }),
  entry({ fieldId: 'psu-v', name: 'Voltage', owner: 'component', componentId: 'psu', componentName: 'PSU' }),
  entry({ fieldId: 'fan-rpm', name: 'RPM', owner: 'component', componentId: 'fan', componentName: 'FAN' }),
];

const scalar = (n: number) => ({ value: n, unit_id: 'u1' });

describe('resolveVariantSpec (V.2)', () => {
  it('no deltas → the base spec verbatim, nothing overridden', () => {
    const { entries, warnings } = resolveVariantSpec({
      base,
      componentFieldsById: {},
      componentNamesById: {},
      deltas: [],
    });
    expect(warnings).toHaveLength(0);
    expect(entries.map((e) => e.fieldId)).toEqual(['p1', 'psu-v', 'fan-rpm']);
    expect(entries.every((e) => e.origin === 'base' && !e.overridden)).toBe(true);
  });

  it('SCALAR_OVERRIDE replaces a field value and flags it', () => {
    const deltas: VariantDeltaForResolution[] = [
      { type: 'SCALAR_OVERRIDE', componentId: 'psu', fieldId: 'psu-v', overrideValue: scalar(48) },
    ];
    const { entries, warnings } = resolveVariantSpec({ base, componentFieldsById: {}, componentNamesById: {}, deltas });
    expect(warnings).toHaveLength(0);
    const v = entries.find((e) => e.fieldId === 'psu-v')!;
    expect(v.value).toEqual(scalar(48));
    expect(v.overridden).toBe(true);
  });

  it('warns when an override targets a field not present', () => {
    const deltas: VariantDeltaForResolution[] = [
      { type: 'SCALAR_OVERRIDE', componentId: 'psu', fieldId: 'ghost', overrideValue: scalar(1) },
    ];
    const { warnings } = resolveVariantSpec({ base, componentFieldsById: {}, componentNamesById: {}, deltas });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.type).toBe('SCALAR_OVERRIDE');
  });

  it('COMPONENT_REMOVE drops the component’s fields; absent → warning', () => {
    const removed = resolveVariantSpec({
      base,
      componentFieldsById: {},
      componentNamesById: {},
      deltas: [{ type: 'COMPONENT_REMOVE', componentId: 'fan' }],
    });
    expect(removed.entries.map((e) => e.fieldId)).toEqual(['p1', 'psu-v']);
    expect(removed.warnings).toHaveLength(0);

    const absent = resolveVariantSpec({
      base,
      componentFieldsById: {},
      componentNamesById: {},
      deltas: [{ type: 'COMPONENT_REMOVE', componentId: 'nope' }],
    });
    expect(absent.warnings).toHaveLength(1);
  });

  it('COMPONENT_SWAP replaces a component’s fields in place, tagged swapped', () => {
    const componentFieldsById = {
      psu2: [entry({ fieldId: 'psu2-v', name: 'Voltage', componentId: 'psu2', componentName: 'PSU2' })],
    };
    const { entries } = resolveVariantSpec({
      base,
      componentFieldsById,
      componentNamesById: { psu2: 'PSU2' },
      deltas: [{ type: 'COMPONENT_SWAP', componentId: 'psu', replacementComponentId: 'psu2' }],
    });
    // PSU's field is gone; PSU2's takes its slot (index 1), origin swapped.
    expect(entries.map((e) => e.fieldId)).toEqual(['p1', 'psu2-v', 'fan-rpm']);
    const swapped = entries.find((e) => e.fieldId === 'psu2-v')!;
    expect(swapped.origin).toBe('swapped');
    expect(swapped.componentName).toBe('PSU2');
  });

  it('COMPONENT_ADD appends the new component’s fields, tagged added', () => {
    const componentFieldsById = {
      led: [entry({ fieldId: 'led-lm', name: 'Lumens', componentId: 'led', componentName: 'LED' })],
    };
    const { entries } = resolveVariantSpec({
      base,
      componentFieldsById,
      componentNamesById: { led: 'LED' },
      deltas: [{ type: 'COMPONENT_ADD', newComponentId: 'led' }],
    });
    expect(entries.map((e) => e.fieldId)).toEqual(['p1', 'psu-v', 'fan-rpm', 'led-lm']);
    expect(entries.at(-1)!.origin).toBe('added');
  });

  it('applies deltas in order — a swap then an override on the swapped-in field wins', () => {
    const componentFieldsById = {
      psu2: [entry({ fieldId: 'psu2-v', name: 'Voltage', componentId: 'psu2', componentName: 'PSU2', value: scalar(12) })],
    };
    const { entries, warnings } = resolveVariantSpec({
      base,
      componentFieldsById,
      componentNamesById: { psu2: 'PSU2' },
      deltas: [
        { type: 'COMPONENT_SWAP', componentId: 'psu', replacementComponentId: 'psu2' },
        { type: 'SCALAR_OVERRIDE', componentId: 'psu2', fieldId: 'psu2-v', overrideValue: scalar(60) },
      ],
    });
    expect(warnings).toHaveLength(0);
    const v = entries.find((e) => e.fieldId === 'psu2-v')!;
    expect(v.value).toEqual(scalar(60));
    expect(v.overridden).toBe(true);
  });

  it('later delta wins — removing a component after overriding its field leaves it gone', () => {
    const { entries, warnings } = resolveVariantSpec({
      base,
      componentFieldsById: {},
      componentNamesById: {},
      deltas: [
        { type: 'SCALAR_OVERRIDE', componentId: 'fan', fieldId: 'fan-rpm', overrideValue: scalar(3000) },
        { type: 'COMPONENT_REMOVE', componentId: 'fan' },
      ],
    });
    expect(entries.some((e) => e.componentId === 'fan')).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it('does not mutate the caller’s base array', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    resolveVariantSpec({
      base,
      componentFieldsById: {},
      componentNamesById: {},
      deltas: [{ type: 'SCALAR_OVERRIDE', componentId: 'psu', fieldId: 'psu-v', overrideValue: scalar(99) }],
    });
    expect(base).toEqual(snapshot);
  });
});
