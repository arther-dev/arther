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
