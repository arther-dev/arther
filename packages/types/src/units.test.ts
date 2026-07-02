import { describe, expect, it } from 'vitest';
import { convertFieldValueUnits, convertUnitAmount, convertUnitDelta } from './units';

const V = { id: 'u-v', symbol: 'V', dimension: 'voltage', si_factor: 1 };
const mV = { id: 'u-mv', symbol: 'mV', dimension: 'voltage', si_factor: 0.001 };
const kV = { id: 'u-kv', symbol: 'kV', dimension: 'voltage', si_factor: 1000 };
const mm = { id: 'u-mm', symbol: 'mm', dimension: 'length', si_factor: 0.001 };
const m = { id: 'u-m', symbol: 'm', dimension: 'length', si_factor: 1 };
const C = { id: 'u-c', symbol: '°C', dimension: 'temperature', si_factor: 1 };
const K = { id: 'u-k', symbol: 'K', dimension: 'temperature', si_factor: 1 };
const kg = { id: 'u-kg', symbol: 'kg', dimension: 'mass', si_factor: 1 };

describe('convertUnitAmount', () => {
  it('converts within a dimension via the SI base', () => {
    expect(convertUnitAmount(5, V, mV)).toBe(5000);
    expect(convertUnitAmount(5000, mV, V)).toBe(5);
    expect(convertUnitAmount(2.4, kV, V)).toBe(2400);
    expect(convertUnitAmount(1500, mm, m)).toBe(1.5);
  });

  it('is exact where naive float math is not (0.1 V → 100 mV)', () => {
    expect(convertUnitAmount(0.1, V, mV)).toBe(100);
  });

  it('handles the °C offset (the registry’s app-side offset unit)', () => {
    expect(convertUnitAmount(25, C, K)).toBe(298.15);
    expect(convertUnitAmount(273.15, K, C)).toBe(0);
    expect(convertUnitAmount(0, K, C)).toBe(-273.15);
  });

  it('returns the amount unchanged for the same unit', () => {
    expect(convertUnitAmount(42, V, V)).toBe(42);
  });

  it('refuses cross-dimension conversion', () => {
    expect(convertUnitAmount(5, V, kg)).toBeNull();
  });

  it('tolerates a stringy numeric factor and refuses a malformed one', () => {
    expect(convertUnitAmount(5, { ...V, si_factor: '1' }, { ...mV, si_factor: '0.001' })).toBe(5000);
    expect(convertUnitAmount(5, { ...V, si_factor: 'oops' }, mV)).toBeNull();
    expect(convertUnitAmount(5, V, { ...mV, si_factor: 0 })).toBeNull();
  });
});

describe('convertUnitDelta', () => {
  it('scales differences by factor only — no offset', () => {
    expect(convertUnitDelta(5, C, K)).toBe(5); // ±5 °C is ±5 K
    expect(convertUnitDelta(0.5, V, mV)).toBe(500);
  });

  it('refuses cross-dimension conversion', () => {
    expect(convertUnitDelta(5, V, kg)).toBeNull();
  });
});

describe('convertFieldValueUnits', () => {
  it('converts a scalar and repins its unit', () => {
    expect(convertFieldValueUnits('scalar', { value: 5, unit_id: V.id }, V, mV)).toEqual({
      value: 5000,
      unit_id: mV.id,
    });
  });

  it('converts both ends of a range', () => {
    expect(
      convertFieldValueUnits('range', { min: 1, max: 2, unit_id: m.id }, m, mm),
    ).toEqual({ min: 1000, max: 2000, unit_id: mm.id });
  });

  it('converts a toleranced nominal affinely and an absolute tolerance as a delta', () => {
    expect(
      convertFieldValueUnits(
        'toleranced',
        { nominal: 25, tolerance: 5, tolerance_type: 'absolute', unit_id: C.id },
        C,
        K,
      ),
    ).toEqual({ nominal: 298.15, tolerance: 5, tolerance_type: 'absolute', unit_id: K.id });
  });

  it('leaves a percentage tolerance untouched', () => {
    expect(
      convertFieldValueUnits(
        'toleranced',
        { nominal: 5, tolerance: 10, tolerance_type: 'percentage', unit_id: V.id },
        V,
        mV,
      ),
    ).toEqual({ nominal: 5000, tolerance: 10, tolerance_type: 'percentage', unit_id: mV.id });
  });

  it('returns null for non-numeric types and non-convertible pairs', () => {
    expect(convertFieldValueUnits('boolean', { value: true }, V, mV)).toBeNull();
    expect(convertFieldValueUnits('scalar', { value: 5, unit_id: V.id }, V, kg)).toBeNull();
  });
});
