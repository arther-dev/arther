import { formatFieldValue } from './format';
import type { FieldType, FieldValue } from './field-values';

/**
 * G4 (live data blocks) — what a spec_table / chart block needs resolved from the
 * spec database at render time (spec §3.1: the value is read live, never frozen
 * into the block). The pure `block-renderer` is handed this per field_id; the app
 * builds it server-side from the product's current field versions.
 */
export interface ResolvedSpecField {
  name: string;
  type: FieldType;
  /** The field's current value, or null when nothing has been entered yet. */
  value: FieldValue | null;
  unitSymbol: string | null;
  /** Owning component's name, or null for a product-level field. */
  ownerName: string | null;
}

export type SpecFieldResolution = Record<string, ResolvedSpecField>;

export interface SpecTableCells {
  min: string;
  typical: string;
  max: string;
}

const EM_DASH = '—';

function fmtNumber(n: number, unit: string | null, decimals?: number): string {
  const s = decimals != null ? n.toFixed(decimals) : String(n);
  return unit ? `${s} ${unit}` : s;
}

/**
 * Derive a spec_table row's Min / Typical / Max cells from the field's current
 * value (spec §5.5). Scalar → one typical value; range → min & max; toleranced →
 * nominal as typical with the ± bounds as min/max. Other field types collapse to
 * a single formatted value in the typical column. A null value renders as em
 * dashes (not yet entered, never a fabricated number — invariant 6).
 */
export function deriveSpecTableCells(
  type: FieldType,
  value: FieldValue | null,
  unitSymbol: string | null,
  decimals?: number,
): SpecTableCells {
  if (value == null) return { min: EM_DASH, typical: EM_DASH, max: EM_DASH };

  switch (type) {
    case 'scalar': {
      const v = value as { value: number };
      return { min: EM_DASH, typical: fmtNumber(v.value, unitSymbol, decimals), max: EM_DASH };
    }
    case 'range': {
      const v = value as { min: number; max: number };
      return {
        min: fmtNumber(v.min, unitSymbol, decimals),
        typical: EM_DASH,
        max: fmtNumber(v.max, unitSymbol, decimals),
      };
    }
    case 'toleranced': {
      const v = value as { nominal: number; tolerance: number; tolerance_type: 'absolute' | 'percentage' };
      const delta = v.tolerance_type === 'absolute' ? v.tolerance : (v.nominal * v.tolerance) / 100;
      return {
        min: fmtNumber(v.nominal - delta, unitSymbol, decimals),
        typical: fmtNumber(v.nominal, unitSymbol, decimals),
        max: fmtNumber(v.nominal + delta, unitSymbol, decimals),
      };
    }
    default:
      // boolean / enum / multi_enum / reference / table — a single formatted value.
      return { min: EM_DASH, typical: formatFieldValue(type, value, unitSymbol ?? undefined), max: EM_DASH };
  }
}
