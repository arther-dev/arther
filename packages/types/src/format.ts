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

/**
 * Resolve the unit symbol a stored value displays with: a `unit_id` embedded in
 * the value object (versioned values pin the unit they were entered in) wins
 * over the field's current unit. The one implementation of that precedence —
 * the spec grid, the override row, and the history feed all use it.
 */
export function unitSymbolFor(
  value: unknown,
  fieldUnitId: string | null,
  units: ReadonlyArray<{ id: string; symbol: string }>,
): string | undefined {
  const unitId =
    value && typeof value === 'object' && 'unit_id' in value
      ? ((value as { unit_id?: string | null }).unit_id ?? fieldUnitId)
      : fieldUnitId;
  return units.find((u) => u.id === unitId)?.symbol;
}

/**
 * A (review-cycle-time) — a compact human duration from a count of hours: "—" when
 * unknown, minutes under an hour, "Xh" / "Xd Yh" otherwise. Pure; used by the admin
 * analytics surface to render average/median time-in-review.
 */
export function formatReviewDuration(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} min`;
  }
  if (hours < 24) {
    const h = Math.round(hours * 10) / 10;
    return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours - days * 24);
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}
