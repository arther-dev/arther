import {
  safeParseFieldValue,
  type FieldValue,
  type TableValue,
} from '@arther/types';
import {
  type ImportableFieldType,
  type InterpretedField,
  type InterpretedImport,
  type TableSource,
} from './interpretation';
import type { ParsedCell, ParsedWorkbook } from './parse';

/**
 * F7.2 (unit extraction/normalisation) + F7.5 (validation pass): turn the
 * model's raw interpretation into registry-resolved, Zod-valid FieldValues.
 * Deterministic — given the same interpretation, workbook, and registry it
 * always produces the same normalised import, so review-step re-renders and
 * the final commit can recompute instead of trusting stored state.
 *
 * "Unrecognised unit → imported as text" (spec §6.2 step 4): there is no text
 * field type, so the honest equivalent is value = null with the raw reading
 * preserved in `conditions` and a warning row — nothing is lost, nothing is
 * guessed.
 */

export interface UnitRegistryEntry {
  id: string;
  name: string;
  symbol: string;
  dimension: string;
}

export interface ImportWarning {
  kind:
    | 'unrecognised_unit'
    | 'unknown_category'
    | 'value_not_in_source'
    | 'table_invalid'
    | 'duplicate_field'
    | 'note';
  message: string;
  /** Owner context for the validation screen ("Stator › Rated Voltage"). */
  componentName?: string | null;
  fieldName?: string | null;
  sheet?: string | null;
  row?: number | null;
}

export interface NormalizedField {
  /** Stable key derived from interpretation position — decisions attach here. */
  key: string;
  name: string;
  type: ImportableFieldType;
  category: string;
  unitId: string | null;
  options: string[] | null;
  conditions: string | null;
  value: FieldValue | null;
  source: { sheet: string; row: number } | null;
}

export interface NormalizedComponent {
  key: string;
  name: string;
  componentType: 'assembly' | 'module' | 'part';
  parentName: string | null;
  quantity: number;
  sheet: string | null;
  fields: NormalizedField[];
}

export interface NormalizedImport {
  productName: string;
  productDescription: string | null;
  productFields: NormalizedField[];
  components: NormalizedComponent[];
  warnings: ImportWarning[];
}

/**
 * Resolve a unit string against the registry: exact symbol, then
 * case-insensitive name, then a folded/alias match — conservative because
 * SI-prefix case is load-bearing (mV vs MV), so folded matches only count
 * when unambiguous.
 */
export function resolveUnit(
  raw: string | null,
  units: UnitRegistryEntry[],
): UnitRegistryEntry | null {
  if (raw === null) return null;
  // NBSP → space before trimming (Excel exports love non-breaking spaces).
  const s = raw.replace(/\u00a0/g, ' ').trim();
  if (s === '') return null;
  const exact = units.find((u) => u.symbol === s);
  if (exact) return exact;
  const byName = units.filter((u) => u.name.toLowerCase() === s.toLowerCase());
  if (byName.length === 1) return byName[0]!;
  const folded = foldUnit(s);
  const aliased = UNIT_ALIASES.get(folded);
  if (aliased) {
    const target = units.find((u) => u.symbol === aliased);
    if (target) return target;
  }
  const byFold = units.filter((u) => foldUnit(u.symbol) === folded);
  return byFold.length === 1 ? byFold[0]! : null;
}

/** Lowercase + strip separators + spell Greek so "µF", "uF", "Ω" line up. */
function foldUnit(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s·.]/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/ω/g, 'ohm')
    .replace(/°/g, 'deg');
}

/** Folded spelling → registry symbol, for forms the fold alone can't unify. */
const UNIT_ALIASES = new Map<string, string>([
  ['rpm', 'RPM'],
  ['rev/min', 'RPM'],
  ['r/min', 'RPM'],
  ['revolutionsperminute', 'RPM'],
  ['volt', 'V'],
  ['volts', 'V'],
  ['amp', 'A'],
  ['amps', 'A'],
  ['ampere', 'A'],
  ['amperes', 'A'],
  ['watt', 'W'],
  ['watts', 'W'],
  ['ohms', 'Ω'],
  ['degc', '°C'],
  ['celsius', '°C'],
  ['degreescelsius', '°C'],
  ['percent', '%'],
  ['pct', '%'],
  ['hz', 'Hz'],
  ['khz', 'kHz'],
  ['mhz', 'MHz'],
  ['kgm2', 'kg·m²'],
  ['kgm^2', 'kg·m²'],
  ['mm2', 'mm²'],
  ['mm^2', 'mm²'],
  ['cm2', 'cm²'],
  ['cm^2', 'cm²'],
  ['nm', 'N·m'],
  ['psi', 'PSI'],
  ['l/min', 'L/min'],
  ['ml/min', 'mL/min'],
  ['cpr', 'CPR'],
  ['db', 'dB'],
]);

export function normalizeImport(
  interpreted: InterpretedImport,
  workbook: ParsedWorkbook,
  units: UnitRegistryEntry[],
  categories: string[],
): NormalizedImport {
  const warnings: ImportWarning[] = [];
  for (const note of interpreted.notes) {
    warnings.push({
      kind: 'note',
      message: `${note.kind.replace(/_/g, ' ')}: ${note.message}`,
      sheet: note.sheet,
      row: note.row,
    });
  }

  const productFields = normalizeFields(
    interpreted.product_fields,
    'p',
    null,
    workbook,
    units,
    categories,
    warnings,
  );
  const components = interpreted.components.map((component, i) => ({
    key: `c${i}`,
    name: component.name.trim(),
    componentType: component.component_type,
    parentName: component.parent?.trim() || null,
    quantity: component.quantity ?? 1,
    sheet: component.sheet,
    fields: normalizeFields(
      component.fields,
      `c${i}`,
      component.name,
      workbook,
      units,
      categories,
      warnings,
    ),
  }));

  return {
    productName: interpreted.product.name.trim(),
    productDescription: interpreted.product.description,
    productFields,
    components,
    warnings,
  };
}

function normalizeFields(
  fields: InterpretedField[],
  keyPrefix: string,
  componentName: string | null,
  workbook: ParsedWorkbook,
  units: UnitRegistryEntry[],
  categories: string[],
  warnings: ImportWarning[],
): NormalizedField[] {
  const seen = new Map<string, number>();
  return fields.map((field, i) => {
    const normalized = normalizeField(
      field,
      `${keyPrefix}.f${i}`,
      componentName,
      workbook,
      units,
      categories,
      warnings,
    );
    // F7.5: duplicate field names within one owner are disambiguated, not dropped.
    const lower = normalized.name.toLowerCase();
    const count = (seen.get(lower) ?? 0) + 1;
    seen.set(lower, count);
    if (count > 1) {
      warnings.push({
        kind: 'duplicate_field',
        message: `Duplicate field name "${normalized.name}" — renamed to "${normalized.name} (${count})".`,
        componentName,
        fieldName: normalized.name,
        sheet: normalized.source?.sheet ?? null,
        row: normalized.source?.row ?? null,
      });
      normalized.name = `${normalized.name} (${count})`;
    }
    return normalized;
  });
}

function normalizeField(
  field: InterpretedField,
  key: string,
  componentName: string | null,
  workbook: ParsedWorkbook,
  units: UnitRegistryEntry[],
  categories: string[],
  warnings: ImportWarning[],
): NormalizedField {
  const warn = (kind: ImportWarning['kind'], message: string) =>
    warnings.push({
      kind,
      message,
      componentName,
      fieldName: field.name,
      sheet: field.source?.sheet ?? null,
      row: field.source?.row ?? null,
    });

  let category = field.category.trim();
  const matchedCategory = categories.find((c) => c.toLowerCase() === category.toLowerCase());
  if (matchedCategory) {
    category = matchedCategory;
  } else {
    warn('unknown_category', `Category "${category}" isn't in the workspace list — using General.`);
    category = 'General';
  }

  const base = {
    key,
    name: field.name.trim(),
    category,
    conditions: field.conditions,
    source: field.source,
    options: null as string[] | null,
  };
  const value = field.value;

  /** The unresolved-value fallback: keep the field, lose nothing, flag it. */
  const fallback = (
    type: ImportableFieldType,
    rawText: string | null,
  ): NormalizedField => ({
    ...base,
    type,
    unitId: null,
    value: null,
    conditions: appendRaw(base.conditions, rawText),
  });

  switch (value.kind) {
    case 'scalar':
    case 'range':
    case 'toleranced': {
      const unit = resolveUnit(value.unit, units);
      if (!unit) {
        warn(
          'unrecognised_unit',
          `Unit "${value.unit ?? '(none)'}" isn't in the registry — value kept as text in conditions.`,
        );
        return fallback(value.kind, rawNumericText(value));
      }
      const candidate: FieldValue =
        value.kind === 'scalar'
          ? { value: value.value, unit_id: unit.id }
          : value.kind === 'range'
            ? { min: Math.min(value.min, value.max), max: Math.max(value.min, value.max), unit_id: unit.id }
            : {
                nominal: value.nominal,
                tolerance: Math.abs(value.tolerance),
                tolerance_type: value.tolerance_type,
                unit_id: unit.id,
              };
      const parsed = safeParseFieldValue(value.kind, candidate);
      if (!parsed.success) {
        warn('table_invalid', `Value didn't validate: ${parsed.error.issues[0]?.message}`);
        return fallback(value.kind, rawNumericText(value));
      }
      checkValueInSource(value, field, workbook, warn);
      return { ...base, type: value.kind, unitId: unit.id, value: parsed.data as FieldValue };
    }
    case 'boolean':
      return { ...base, type: 'boolean', unitId: null, value: { value: value.value } };
    case 'enum': {
      const options = dedupe([...value.options, value.selected]);
      return {
        ...base,
        type: 'enum',
        unitId: null,
        options,
        value: { selected: value.selected, options },
      };
    }
    case 'multi_enum': {
      const selected = dedupe(value.selected);
      const options = dedupe([...value.options, ...selected]);
      return {
        ...base,
        type: 'multi_enum',
        unitId: null,
        options,
        value: { selected, options },
      };
    }
    case 'table': {
      const table = materializeTable(value.source, workbook, units, warn);
      return { ...base, type: 'table', unitId: null, value: table };
    }
    case 'empty':
      return fallback('scalar', value.raw_text);
  }
}

function appendRaw(conditions: string | null, rawText: string | null): string | null {
  if (!rawText) return conditions;
  const note = `Imported reading: ${rawText}`;
  return conditions ? `${conditions} — ${note}` : note;
}

function rawNumericText(
  value:
    | { kind: 'scalar'; value: number; unit: string | null }
    | { kind: 'range'; min: number; max: number; unit: string | null }
    | { kind: 'toleranced'; nominal: number; tolerance: number; tolerance_type: string; unit: string | null },
): string {
  const u = value.unit ? ` ${value.unit}` : '';
  if (value.kind === 'scalar') return `${value.value}${u}`;
  if (value.kind === 'range') return `${value.min}–${value.max}${u}`;
  return `${value.nominal} ±${value.tolerance}${value.tolerance_type === 'percentage' ? '%' : u}`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/**
 * Import-side grounding check: the numbers the model extracted should appear
 * in the source row it cites. A miss is a warning, not a rejection — merged
 * cells and unit conversions produce legitimate misses.
 */
function checkValueInSource(
  value:
    | { kind: 'scalar'; value: number }
    | { kind: 'range'; min: number; max: number }
    | { kind: 'toleranced'; nominal: number; tolerance: number },
  field: InterpretedField,
  workbook: ParsedWorkbook,
  warn: (kind: ImportWarning['kind'], message: string) => void,
): void {
  if (!field.source) return;
  const sheet = workbook.sheets.find(
    (s) => s.name.toLowerCase() === field.source!.sheet.toLowerCase(),
  );
  const row = sheet?.rows[field.source.row - 1];
  if (!row) {
    warn('value_not_in_source', `Cited source row ${field.source.row} doesn't exist — verify the value.`);
    return;
  }
  const numbers =
    value.kind === 'scalar'
      ? [value.value]
      : value.kind === 'range'
        ? [value.min, value.max]
        : [value.nominal];
  const missing = numbers.filter((n) => !rowContainsNumber(row, n));
  if (missing.length > 0) {
    warn(
      'value_not_in_source',
      `Value ${missing.join(', ')} not found in the cited source row — verify before committing.`,
    );
  }
}

function rowContainsNumber(row: ParsedCell[], n: number): boolean {
  return row.some((cell) => {
    if (typeof cell === 'number') return Math.abs(cell - n) < 1e-9;
    if (typeof cell === 'string') {
      // "36 V ±5%" contains 36; compare extracted numerics to tolerate "36.0".
      const matches = cell.match(/-?\d+\.?\d*/g) ?? [];
      return matches.some((m) => Math.abs(Number(m) - n) < 1e-9);
    }
    return false;
  });
}

/** Numbers come from the parsed file, never from the model (F7.2). */
function materializeTable(
  source: TableSource,
  workbook: ParsedWorkbook,
  units: UnitRegistryEntry[],
  warn: (kind: ImportWarning['kind'], message: string) => void,
): TableValue | null {
  const sheet = workbook.sheets.find((s) => s.name.toLowerCase() === source.sheet.toLowerCase());
  if (!sheet) {
    warn('table_invalid', `Table source sheet "${source.sheet}" not found.`);
    return null;
  }
  const columns = [];
  for (const [i, col] of source.columns.entries()) {
    const unit = resolveUnit(col.unit, units);
    if (!unit) {
      warn(
        'table_invalid',
        `Table column "${col.name}" has unrecognised unit "${col.unit ?? '(none)'}" — table left empty for manual entry.`,
      );
      return null;
    }
    columns.push({ id: `c${i + 1}`, name: col.name, unit_id: unit.id, role: col.role });
  }
  const first = Math.max(source.first_data_row, 1);
  const last = Math.min(source.last_data_row, sheet.rows.length);
  const rows = [];
  for (let r = first; r <= last; r += 1) {
    const sheetRow = sheet.rows[r - 1] ?? [];
    const values: Record<string, number | null> = {};
    let hasValue = false;
    for (const [i, col] of source.columns.entries()) {
      const v = numericCell(sheetRow[col.source_column - 1] ?? null);
      values[`c${i + 1}`] = v;
      if (v !== null) hasValue = true;
    }
    if (hasValue) rows.push({ id: `r${rows.length + 1}`, values });
  }
  const candidate = { columns, rows, interpolation: 'linear' as const };
  const parsed = safeParseFieldValue('table', candidate);
  if (!parsed.success) {
    warn('table_invalid', `Extracted table didn't validate: ${parsed.error.issues[0]?.message}`);
    return null;
  }
  return parsed.data as TableValue;
}

/** "1,250 rpm" → 1250; "—" → null. Conservative: one numeric reading per cell. */
function numericCell(cell: ParsedCell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== 'string') return null;
  const match = cell.replace(/,/g, '').match(/-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
