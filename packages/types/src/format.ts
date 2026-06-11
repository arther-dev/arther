import type { FieldType, FieldValue, RangeValue, TolerancedValue } from './field-values';

/**
 * Display formatting for field values — one implementation for the spec grid,
 * inline spec tokens (Phase 2), portal rendering, and PDF. Unit symbols are
 * resolved by the caller (unit registry lookup).
 */
export function formatFieldValue(
  type: FieldType,
  value: FieldValue | null,
  unitSymbol?: string,
): string {
  if (value === null) return '—'; // null = "not yet entered" (0003)
  const u = unitSymbol ? ` ${unitSymbol}` : '';
  switch (type) {
    case 'scalar':
      return `${(value as { value: number }).value}${u}`;
    case 'range': {
      const v = value as RangeValue;
      return `${v.min} to ${v.max}${u}`;
    }
    case 'toleranced': {
      const v = value as TolerancedValue;
      return v.tolerance_type === 'percentage'
        ? `${v.nominal}${u} ±${v.tolerance}%`
        : `${v.nominal}${u} ±${v.tolerance}${u}`;
    }
    case 'boolean':
      return (value as { value: boolean }).value ? 'Yes' : 'No';
    case 'enum':
      return (value as { selected: string }).selected;
    case 'multi_enum':
      return (value as { selected: string[] }).selected.join(', ');
    case 'table': {
      const v = value as { columns: unknown[]; rows: unknown[] };
      return `Table (${v.rows.length}×${v.columns.length})`;
    }
    case 'reference':
      return '→ component';
  }
}
