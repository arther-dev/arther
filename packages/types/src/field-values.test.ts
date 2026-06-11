import { describe, expect, it } from 'vitest';
import {
  fieldTypeSchema,
  isOverridableFieldType,
  OVERRIDABLE_FIELD_TYPES,
  parseFieldValue,
  safeParseFieldValue,
  tableValueSchema,
} from './field-values';

const UNIT = '0d4ee021-92eb-44a5-a1a4-6b04f7e3e159';
const COMPONENT = '7a9a16a8-5df1-4f5d-9f3a-2f6a3a4f1f00';

describe('fieldTypeSchema', () => {
  it('matches the migration 0003 check constraint', () => {
    expect(fieldTypeSchema.options).toEqual([
      'scalar',
      'range',
      'toleranced',
      'boolean',
      'enum',
      'multi_enum',
      'table',
      'reference',
    ]);
  });
});

describe('scalar', () => {
  it('accepts a numeric value with a unit', () => {
    expect(parseFieldValue('scalar', { value: 36, unit_id: UNIT })).toEqual({
      value: 36,
      unit_id: UNIT,
    });
  });

  it('rejects missing unit, non-finite values, and unknown keys', () => {
    expect(safeParseFieldValue('scalar', { value: 36 }).success).toBe(false);
    expect(safeParseFieldValue('scalar', { value: Infinity, unit_id: UNIT }).success).toBe(false);
    expect(safeParseFieldValue('scalar', { value: 1, unit_id: UNIT, extra: 1 }).success).toBe(false);
  });
});

describe('range', () => {
  it('accepts min ≤ max sharing a unit (incl. negative-to-positive spans)', () => {
    expect(safeParseFieldValue('range', { min: -20, max: 85, unit_id: UNIT }).success).toBe(true);
  });

  it('rejects min > max', () => {
    const r = safeParseFieldValue('range', { min: 90, max: 85, unit_id: UNIT });
    expect(r.success).toBe(false);
  });
});

describe('toleranced', () => {
  it('accepts nominal ± tolerance with a type', () => {
    expect(
      safeParseFieldValue('toleranced', {
        nominal: 24,
        tolerance: 5,
        tolerance_type: 'percentage',
        unit_id: UNIT,
      }).success,
    ).toBe(true);
  });

  it('rejects negative tolerance and unknown tolerance types', () => {
    expect(
      safeParseFieldValue('toleranced', {
        nominal: 24,
        tolerance: -1,
        tolerance_type: 'absolute',
        unit_id: UNIT,
      }).success,
    ).toBe(false);
    expect(
      safeParseFieldValue('toleranced', {
        nominal: 24,
        tolerance: 1,
        tolerance_type: 'ppm',
        unit_id: UNIT,
      }).success,
    ).toBe(false);
  });
});

describe('enum / multi_enum', () => {
  it('requires selected ∈ options', () => {
    expect(
      safeParseFieldValue('enum', { selected: 'IP67', options: ['IP65', 'IP67'] }).success,
    ).toBe(true);
    expect(
      safeParseFieldValue('enum', { selected: 'IP68', options: ['IP65', 'IP67'] }).success,
    ).toBe(false);
  });

  it('requires every multi_enum selection to be a unique known option', () => {
    expect(
      safeParseFieldValue('multi_enum', { selected: ['CE', 'UL'], options: ['CE', 'UL', 'CSA'] })
        .success,
    ).toBe(true);
    expect(
      safeParseFieldValue('multi_enum', { selected: ['CE', 'CE'], options: ['CE', 'UL'] }).success,
    ).toBe(false);
    expect(
      safeParseFieldValue('multi_enum', { selected: ['FCC'], options: ['CE', 'UL'] }).success,
    ).toBe(false);
  });

  it('rejects duplicate option lists', () => {
    expect(
      safeParseFieldValue('enum', { selected: 'A', options: ['A', 'A'] }).success,
    ).toBe(false);
  });
});

describe('table', () => {
  const speedTorque = {
    columns: [
      { id: 'speed', name: 'Speed', unit_id: UNIT, role: 'independent' },
      { id: 'torque', name: 'Torque', unit_id: UNIT, role: 'dependent' },
    ],
    rows: [
      { id: 'r1', values: { speed: 0, torque: 2.4 } },
      { id: 'r2', values: { speed: 3000, torque: null } },
    ],
    interpolation: 'linear',
  };

  it('accepts a 2D curve with null gaps', () => {
    expect(tableValueSchema.safeParse(speedTorque).success).toBe(true);
  });

  it('accepts multi-series 2D and 2D-surface shapes', () => {
    const multiSeries = {
      ...speedTorque,
      columns: [
        ...speedTorque.columns,
        { id: 'temp', name: 'Temp', unit_id: UNIT, role: 'series' },
      ],
    };
    expect(tableValueSchema.safeParse(multiSeries).success).toBe(true);

    const surface = {
      ...speedTorque,
      columns: [
        { id: 'speed', name: 'Speed', unit_id: UNIT, role: 'independent' },
        { id: 'load', name: 'Load', unit_id: UNIT, role: 'independent' },
        { id: 'eff', name: 'Efficiency', unit_id: UNIT, role: 'dependent' },
      ],
      rows: [{ id: 'r1', values: { speed: 1000, load: 50, eff: 93 } }],
    };
    expect(tableValueSchema.safeParse(surface).success).toBe(true);
  });

  it('rejects structural violations', () => {
    // No dependent column.
    expect(
      tableValueSchema.safeParse({
        ...speedTorque,
        columns: speedTorque.columns.map((c) => ({ ...c, role: 'independent' })),
      }).success,
    ).toBe(false);
    // Three independents.
    expect(
      tableValueSchema.safeParse({
        ...speedTorque,
        columns: [
          { id: 'a', name: 'A', unit_id: UNIT, role: 'independent' },
          { id: 'b', name: 'B', unit_id: UNIT, role: 'independent' },
          { id: 'c', name: 'C', unit_id: UNIT, role: 'independent' },
          { id: 'd', name: 'D', unit_id: UNIT, role: 'dependent' },
        ],
      }).success,
    ).toBe(false);
    // Row referencing an unknown column.
    expect(
      tableValueSchema.safeParse({
        ...speedTorque,
        rows: [{ id: 'r1', values: { ghost: 1 } }],
      }).success,
    ).toBe(false);
    // Duplicate row ids.
    expect(
      tableValueSchema.safeParse({
        ...speedTorque,
        rows: [
          { id: 'r1', values: { speed: 0 } },
          { id: 'r1', values: { speed: 1 } },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('reference', () => {
  it('accepts a component id and nothing else', () => {
    expect(safeParseFieldValue('reference', { component_id: COMPONENT }).success).toBe(true);
    expect(safeParseFieldValue('reference', { component_id: 'molex-430450200' }).success).toBe(
      false,
    );
  });
});

describe('override rules (§3.5)', () => {
  it('allows overrides for scalar types only', () => {
    expect(OVERRIDABLE_FIELD_TYPES).toEqual(['scalar', 'range', 'toleranced', 'enum', 'boolean']);
    expect(isOverridableFieldType('scalar')).toBe(true);
    expect(isOverridableFieldType('table')).toBe(false);
    expect(isOverridableFieldType('reference')).toBe(false);
    expect(isOverridableFieldType('multi_enum')).toBe(false);
  });
});
