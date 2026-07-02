import type { FieldType, FieldValue, RangeValue, ScalarValue, TolerancedValue } from './field-values';

/**
 * Unit conversion over the registry (F6 acceptance: switching a unit converts
 * the displayed value, spec §3.6). Every unit carries a linear `si_factor` to
 * its dimension's SI base; offset units are handled here in the app, exactly
 * as the 0003 schema comment promises — the registry's only offset unit is
 * °C (si = amount + 273.15 with si_factor 1 against a Kelvin base).
 */
export interface ConvertibleUnit {
  id: string;
  symbol: string;
  dimension: string;
  /** numeric column — arrives as number via PostgREST; string tolerated. */
  si_factor: number | string;
}

/** Additive offset to the SI base, applied after the factor (temperature). */
const SI_OFFSETS: Record<string, number> = { '°C': 273.15 };

/** Strip float noise from factor math (0.1 V → exactly 100 mV, not 100.000…01). */
export function roundUnitAmount(n: number): number {
  return Number(n.toPrecision(12));
}

function factor(unit: ConvertibleUnit): number {
  const f = Number(unit.si_factor);
  return Number.isFinite(f) && f !== 0 ? f : NaN;
}

/**
 * Convert an absolute amount between two units of the same dimension via the
 * SI base (affine: factor then offset). Returns null when the units aren't
 * convertible — different dimensions, or a malformed factor — so callers can
 * fall back to leaving the number untouched.
 */
export function convertUnitAmount(
  amount: number,
  from: ConvertibleUnit,
  to: ConvertibleUnit,
): number | null {
  if (from.dimension !== to.dimension) return null;
  if (from.id === to.id) return amount;
  const fromF = factor(from);
  const toF = factor(to);
  if (Number.isNaN(fromF) || Number.isNaN(toF)) return null;
  const si = amount * fromF + (SI_OFFSETS[from.symbol] ?? 0);
  return roundUnitAmount((si - (SI_OFFSETS[to.symbol] ?? 0)) / toF);
}

/**
 * Convert a difference (tolerance, span) between two units of the same
 * dimension. Deltas scale by the factor only — a tolerance of ±5 °C is ±5 K,
 * never ±278.15 K.
 */
export function convertUnitDelta(
  amount: number,
  from: ConvertibleUnit,
  to: ConvertibleUnit,
): number | null {
  if (from.dimension !== to.dimension) return null;
  if (from.id === to.id) return amount;
  const fromF = factor(from);
  const toF = factor(to);
  if (Number.isNaN(fromF) || Number.isNaN(toF)) return null;
  return roundUnitAmount((amount * fromF) / toF);
}

/**
 * Convert a numeric field value into another unit: scalar and range convert
 * as absolute amounts, a toleranced nominal converts as an amount while an
 * `absolute` tolerance converts as a delta (a `percentage` tolerance is
 * relative and unchanged). Non-numeric types and non-convertible unit pairs
 * return null — the caller keeps the original value.
 */
export function convertFieldValueUnits(
  type: FieldType,
  value: FieldValue,
  from: ConvertibleUnit,
  to: ConvertibleUnit,
): FieldValue | null {
  switch (type) {
    case 'scalar': {
      const v = value as ScalarValue;
      const converted = convertUnitAmount(v.value, from, to);
      return converted === null ? null : { ...v, value: converted, unit_id: to.id };
    }
    case 'range': {
      const v = value as RangeValue;
      const min = convertUnitAmount(v.min, from, to);
      const max = convertUnitAmount(v.max, from, to);
      return min === null || max === null ? null : { ...v, min, max, unit_id: to.id };
    }
    case 'toleranced': {
      const v = value as TolerancedValue;
      const nominal = convertUnitAmount(v.nominal, from, to);
      if (nominal === null) return null;
      if (v.tolerance_type === 'percentage') return { ...v, nominal, unit_id: to.id };
      const tolerance = convertUnitDelta(v.tolerance, from, to);
      return tolerance === null ? null : { ...v, nominal, tolerance, unit_id: to.id };
    }
    default:
      return null;
  }
}
