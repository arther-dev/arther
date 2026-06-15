import { describe, expect, it } from 'vitest';
import { applyDecisions, EMPTY_DECISIONS, importDecisionsSchema } from './decisions';
import type { InterpretedImport } from './interpretation';
import { normalizeImport, resolveUnit, type UnitRegistryEntry } from './normalize';
import { parseCsv, renderWorkbookForPrompt, type ParsedWorkbook } from './parse';
import { canonicalJson, reconcile, type CurrentSpecState } from './reconcile';

/** Real uuids — the FieldValue schemas validate unit_id as uuid. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = {
  v: uid(1),
  mv: uid(2),
  a: uid(3),
  rpm: uid(4),
  c: uid(5),
  pct: uid(6),
  uf: uid(7),
  nm: uid(8),
};
const UNITS: UnitRegistryEntry[] = [
  { id: U.v, name: 'Volt', symbol: 'V', dimension: 'voltage' },
  { id: U.mv, name: 'Millivolt', symbol: 'mV', dimension: 'voltage' },
  { id: U.a, name: 'Ampere', symbol: 'A', dimension: 'current' },
  { id: U.rpm, name: 'Revolutions per minute', symbol: 'RPM', dimension: 'angular_velocity' },
  { id: U.c, name: 'Degree Celsius', symbol: '°C', dimension: 'temperature' },
  { id: U.pct, name: 'Percent', symbol: '%', dimension: 'dimensionless' },
  { id: U.uf, name: 'Microfarad', symbol: 'µF', dimension: 'capacitance' },
  { id: U.nm, name: 'Newton metre', symbol: 'N·m', dimension: 'torque' },
];
const CATEGORIES = ['Electrical', 'Mechanical', 'Performance', 'Thermal', 'General'];

describe('parseCsv', () => {
  it('parses quoted fields, embedded commas and newlines, and CRLF', () => {
    const rows = parseCsv('Name,"Value, with comma","multi\nline"\r\nVoltage,24,V\r\n');
    expect(rows).toEqual([
      ['Name', 'Value, with comma', 'multi\nline'],
      ['Voltage', 24, 'V'],
    ]);
  });

  it('keeps unit-bearing strings as strings and bare numerics as numbers', () => {
    const rows = parseCsv('a,24 V,-3.5,1e3,"24"');
    expect(rows).toEqual([['a', '24 V', -3.5, 1000, 24]]);
  });

  it('escapes doubled quotes and drops trailing empty rows', () => {
    expect(parseCsv('"say ""hi""",b\n\n\n')).toEqual([['say "hi"', 'b']]);
  });
});

describe('resolveUnit', () => {
  it('matches exact symbols case-sensitively (mV is not MV)', () => {
    expect(resolveUnit('mV', UNITS)?.id).toBe(U.mv);
    expect(resolveUnit('V', UNITS)?.id).toBe(U.v);
  });

  it('resolves the spec §6.2 example spellings to RPM', () => {
    for (const raw of ['rpm', 'rev/min', 'r/min', 'RPM']) {
      expect(resolveUnit(raw, UNITS)?.id).toBe(U.rpm);
    }
  });

  it('folds micro signs, degree forms, and names', () => {
    expect(resolveUnit('uF', UNITS)?.id).toBe(U.uf);
    expect(resolveUnit('μF', UNITS)?.id).toBe(U.uf);
    expect(resolveUnit('degC', UNITS)?.id).toBe(U.c);
    expect(resolveUnit('volt', UNITS)?.id).toBe(U.v);
    expect(resolveUnit('Nm', UNITS)?.id).toBe(U.nm);
  });

  it('returns null for unknown or empty units', () => {
    expect(resolveUnit('furlongs', UNITS)).toBeNull();
    expect(resolveUnit('  ', UNITS)).toBeNull();
    expect(resolveUnit(null, UNITS)).toBeNull();
  });
});

const WORKBOOK: ParsedWorkbook = {
  filename: 'MotorSpec_v2.1.xlsx',
  sheets: [
    {
      name: 'Specs',
      rows: [
        ['Parameter', 'Value', 'Unit'],
        ['Rated Voltage', 24, 'V'],
        ['Speed Range', '1000-3000', 'rev/min'],
        ['Note: all values at 25C ambient', null, null],
      ],
    },
    {
      name: 'Derating',
      rows: [
        ['Temp (°C)', 'Output (%)'],
        [25, 100],
        [50, 80],
        [75, '60 %'],
      ],
    },
  ],
};

function interpretation(): InterpretedImport {
  return {
    product: { name: 'BLDC Motor X1', description: null },
    product_fields: [
      {
        name: 'Rated Voltage',
        category: 'Electrical',
        conditions: null,
        source: { sheet: 'Specs', row: 2 },
        value: { kind: 'scalar', value: 24, unit: 'V' },
      },
      {
        name: 'Speed Range',
        category: 'Performance',
        conditions: null,
        source: { sheet: 'Specs', row: 3 },
        value: { kind: 'range', min: 1000, max: 3000, unit: 'rev/min' },
      },
      {
        name: 'Derating Curve',
        category: 'Thermal',
        conditions: null,
        source: null,
        value: {
          kind: 'table',
          source: {
            sheet: 'Derating',
            header_row: 1,
            first_data_row: 2,
            last_data_row: 4,
            columns: [
              { source_column: 1, name: 'Temperature', role: 'independent', unit: '°C' },
              { source_column: 2, name: 'Output', role: 'dependent', unit: '%' },
            ],
          },
        },
      },
      {
        name: 'Leakage Current',
        category: 'Electrical',
        conditions: null,
        source: { sheet: 'Specs', row: 2 },
        value: { kind: 'scalar', value: 5, unit: 'furlongs' },
      },
    ],
    components: [
      {
        name: 'Stator',
        component_type: 'part',
        parent: null,
        quantity: 1,
        sheet: 'Specs',
        fields: [
          {
            name: 'Winding Resistance',
            category: 'Electrical',
            conditions: 'at 25°C',
            source: { sheet: 'Specs', row: 2 },
            value: { kind: 'scalar', value: 24, unit: 'V' },
          },
        ],
      },
    ],
    notes: [
      { kind: 'note_row_excluded', message: 'Footnote about ambient temp', sheet: 'Specs', row: 4 },
    ],
  };
}

describe('normalizeImport', () => {
  const normalized = normalizeImport(interpretation(), WORKBOOK, UNITS, CATEGORIES);

  it('resolves units into FieldValues and keeps stable keys', () => {
    const voltage = normalized.productFields[0]!;
    expect(voltage.key).toBe('p.f0');
    expect(voltage.value).toEqual({ value: 24, unit_id: U.v });
    const range = normalized.productFields[1]!;
    expect(range.value).toEqual({ min: 1000, max: 3000, unit_id: U.rpm });
  });

  it('materialises tables from the workbook, not the interpretation', () => {
    const table = normalized.productFields[2]!;
    expect(table.type).toBe('table');
    expect(table.value).toMatchObject({
      columns: [
        { id: 'c1', name: 'Temperature', unit_id: U.c, role: 'independent' },
        { id: 'c2', name: 'Output', unit_id: U.pct, role: 'dependent' },
      ],
      interpolation: 'linear',
    });
    // "60 %" string cell parses numerically; row ids are sequential.
    expect((table.value as { rows: unknown[] }).rows).toEqual([
      { id: 'r1', values: { c1: 25, c2: 100 } },
      { id: 'r2', values: { c1: 50, c2: 80 } },
      { id: 'r3', values: { c1: 75, c2: 60 } },
    ]);
  });

  it('imports unrecognised-unit values as null with the reading preserved (F7.5)', () => {
    const leakage = normalized.productFields[3]!;
    expect(leakage.value).toBeNull();
    expect(leakage.conditions).toContain('5 furlongs');
    expect(
      normalized.warnings.some(
        (w) => w.kind === 'unrecognised_unit' && w.fieldName === 'Leakage Current',
      ),
    ).toBe(true);
  });

  it('flags values that are not present in their cited source row', () => {
    // Stator winding resistance cites Specs row 2, which contains 24 — ok.
    // Mutate to a value not in the row to confirm the check fires.
    const bad = interpretation();
    bad.product_fields[0]!.value = { kind: 'scalar', value: 99, unit: 'V' };
    const result = normalizeImport(bad, WORKBOOK, UNITS, CATEGORIES);
    expect(
      result.warnings.some(
        (w) => w.kind === 'value_not_in_source' && w.fieldName === 'Rated Voltage',
      ),
    ).toBe(true);
  });

  it('falls back to General for categories outside the workspace list', () => {
    const odd = interpretation();
    odd.product_fields[0]!.category = 'Exotic';
    const result = normalizeImport(odd, WORKBOOK, UNITS, CATEGORIES);
    expect(result.productFields[0]!.category).toBe('General');
    expect(result.warnings.some((w) => w.kind === 'unknown_category')).toBe(true);
  });

  it('disambiguates duplicate field names within an owner', () => {
    const dup = interpretation();
    dup.product_fields.push({ ...dup.product_fields[0]!, source: null });
    const result = normalizeImport(dup, WORKBOOK, UNITS, CATEGORIES);
    expect(result.productFields.at(-1)!.name).toBe('Rated Voltage (2)');
    expect(result.warnings.some((w) => w.kind === 'duplicate_field')).toBe(true);
  });
});

describe('reconcile', () => {
  const normalized = normalizeImport(interpretation(), WORKBOOK, UNITS, CATEGORIES);

  it('first import: creates product, components, edges, and fields in order', () => {
    const empty: CurrentSpecState = { product: null, components: [] };
    const plan = reconcile(normalized, empty);
    const kinds = plan.mutations.map((m) => m.kind);
    expect(kinds[0]).toBe('create_product');
    expect(kinds).toContain('create_component');
    expect(kinds).toContain('attach_component');
    expect(plan.summary.added).toBe(5); // 4 product fields + 1 component field
    expect(plan.summary.missing).toBe(0);
    const attach = plan.mutations.find((m) => m.kind === 'attach_component')!;
    expect(attach.kind === 'attach_component' && attach.ckey).toBe('c0');
  });

  it('re-import: unchanged / changed / added / missing-flagged, nothing deleted', () => {
    const current: CurrentSpecState = {
      product: {
        id: 'prod-1',
        name: 'BLDC Motor X1',
        fields: [
          // Unchanged (same canonical value).
          { id: 'f-volt', name: 'rated voltage', type: 'scalar', value: { unit_id: U.v, value: 24 } },
          // Changed (different max).
          { id: 'f-range', name: 'Speed Range', type: 'range', value: { min: 1000, max: 2500, unit_id: U.rpm } },
          // Missing from the sheet — flagged, not deleted.
          { id: 'f-old', name: 'Legacy Field', type: 'scalar', value: { value: 1, unit_id: U.v } },
          // Type conflict: sheet says table, DB says scalar.
          { id: 'f-der', name: 'Derating Curve', type: 'scalar', value: null },
        ],
      },
      components: [
        {
          id: 'comp-stator',
          name: 'stator',
          attached: true,
          fields: [],
        },
      ],
    };
    const plan = reconcile(normalized, current);
    expect(plan.mutations.some((m) => m.kind === 'create_product')).toBe(false);
    expect(plan.mutations.some((m) => m.kind === 'create_component')).toBe(false);
    expect(plan.mutations.some((m) => m.kind === 'attach_component')).toBe(false);
    expect(plan.summary.unchanged).toBe(1);
    expect(plan.summary.changed).toBe(1);
    expect(plan.summary.typeConflicts).toBe(1);
    expect(plan.summary.missing).toBe(1);
    // Leakage Current (null value) is new on the product; Winding Resistance new on Stator.
    expect(plan.summary.added).toBe(2);
    const setValue = plan.mutations.find((m) => m.kind === 'set_value')!;
    expect(setValue.kind === 'set_value' && setValue.fieldId).toBe('f-range');
    const created = plan.mutations.find(
      (m) => m.kind === 'create_field' && m.ownerLabel === 'Stator',
    )!;
    expect(
      created.kind === 'create_field' &&
        created.owner.kind === 'component' &&
        created.owner.componentId,
    ).toBe('comp-stator');
  });

  it('matches an existing unattached component and proposes attach, not create', () => {
    const current: CurrentSpecState = {
      product: { id: 'prod-1', name: 'X', fields: [] },
      components: [{ id: 'comp-stator', name: 'Stator', attached: false, fields: [] }],
    };
    const plan = reconcile(normalized, current);
    expect(plan.mutations.some((m) => m.kind === 'create_component')).toBe(false);
    const attach = plan.mutations.find((m) => m.kind === 'attach_component')!;
    expect(attach.kind === 'attach_component' && attach.componentId).toBe('comp-stator');
    expect(attach.kind === 'attach_component' && attach.matchedExisting).toBe(true);
    expect(plan.summary.matchedComponents).toBe(1);
  });

  it('incoming null values never overwrite existing values', () => {
    const withNull = normalizeImport(interpretation(), WORKBOOK, UNITS, CATEGORIES);
    const current: CurrentSpecState = {
      product: {
        id: 'prod-1',
        name: 'X',
        fields: [
          { id: 'f-leak', name: 'Leakage Current', type: 'scalar', value: { value: 3, unit_id: U.a } },
        ],
      },
      components: [],
    };
    const plan = reconcile(withNull, current);
    const leak = plan.mutations.find(
      (m) => 'fieldId' in m && m.fieldId === 'f-leak',
    )!;
    expect(leak.kind).toBe('unchanged');
  });
});

describe('applyDecisions', () => {
  const normalized = normalizeImport(interpretation(), WORKBOOK, UNITS, CATEGORIES);

  it('is identity for empty decisions', () => {
    expect(canonicalJson(applyDecisions(normalized, EMPTY_DECISIONS))).toBe(
      canonicalJson(normalized),
    );
  });

  it('skips, renames, re-units, and re-categorises', () => {
    const adjusted = applyDecisions(normalized, {
      components: { c0: { skip: true } },
      fields: {
        'p.f0': { name: 'Nominal Voltage', unitId: U.mv, category: 'General' },
        'p.f1': { skip: true },
      },
    });
    expect(adjusted.components).toHaveLength(0);
    expect(adjusted.productFields.some((f) => f.key === 'p.f1')).toBe(false);
    const renamed = adjusted.productFields.find((f) => f.key === 'p.f0')!;
    expect(renamed.name).toBe('Nominal Voltage');
    expect(renamed.category).toBe('General');
    expect(renamed.unitId).toBe(U.mv);
    expect(renamed.value).toEqual({ value: 24, unit_id: U.mv });
  });

  it('clearing a unit nulls the value rather than shipping an invalid one', () => {
    const adjusted = applyDecisions(normalized, {
      components: {},
      fields: { 'p.f0': { unitId: null } },
    });
    expect(adjusted.productFields.find((f) => f.key === 'p.f0')!.value).toBeNull();
  });
});

describe('importDecisionsSchema (F8.5 write-boundary validation)', () => {
  it('accepts well-formed decisions and defaults missing maps', () => {
    expect(importDecisionsSchema.parse({})).toEqual({ components: {}, fields: {} });
    const ok = importDecisionsSchema.safeParse({
      components: { c0: { skip: true, name: 'Stator' } },
      fields: { 'p.f0': { name: 'Voltage', category: 'Electrical' } },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects over-long renamed names and categories', () => {
    const long = 'x'.repeat(201);
    expect(
      importDecisionsSchema.safeParse({ components: { c0: { name: long } }, fields: {} }).success,
    ).toBe(false);
    expect(
      importDecisionsSchema.safeParse({ components: {}, fields: { 'p.f0': { category: long } } })
        .success,
    ).toBe(false);
  });

  it('rejects unknown keys and non-uuid unit ids', () => {
    expect(
      importDecisionsSchema.safeParse({ components: { c0: { bogus: 1 } }, fields: {} }).success,
    ).toBe(false);
    expect(
      importDecisionsSchema.safeParse({ components: {}, fields: { 'p.f0': { unitId: 'nope' } } })
        .success,
    ).toBe(false);
  });
});

describe('renderWorkbookForPrompt', () => {
  it('numbers rows 1-based to match source refs', () => {
    const text = renderWorkbookForPrompt(WORKBOOK);
    expect(text).toContain('### Sheet: "Specs"');
    expect(text).toContain('2 | Rated Voltage | 24 | V');
  });
});
