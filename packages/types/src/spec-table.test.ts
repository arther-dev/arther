import { describe, expect, it } from 'vitest';
import { deriveSpecTableCells } from './spec-table';

describe('deriveSpecTableCells (G4 live data blocks)', () => {
  it('renders em dashes for a not-yet-entered value (never a fabricated number)', () => {
    expect(deriveSpecTableCells('scalar', null, 'V')).toEqual({ min: '—', typical: '—', max: '—' });
  });

  it('puts a scalar value in the typical column with its unit', () => {
    expect(deriveSpecTableCells('scalar', { value: 48, unit_id: 'u' } as never, 'V')).toEqual({
      min: '—',
      typical: '48 V',
      max: '—',
    });
  });

  it('maps a range to min and max', () => {
    expect(deriveSpecTableCells('range', { min: 10, max: 36, unit_id: 'u' } as never, 'V')).toEqual({
      min: '10 V',
      typical: '—',
      max: '36 V',
    });
  });

  it('expands an absolute tolerance into nominal ± bounds', () => {
    expect(
      deriveSpecTableCells(
        'toleranced',
        { nominal: 100, tolerance: 5, tolerance_type: 'absolute', unit_id: 'u' } as never,
        'mm',
      ),
    ).toEqual({ min: '95 mm', typical: '100 mm', max: '105 mm' });
  });

  it('expands a percentage tolerance relative to the nominal', () => {
    expect(
      deriveSpecTableCells(
        'toleranced',
        { nominal: 200, tolerance: 10, tolerance_type: 'percentage', unit_id: 'u' } as never,
        'Ω',
      ),
    ).toEqual({ min: '180 Ω', typical: '200 Ω', max: '220 Ω' });
  });

  it('respects a fixed decimal-place count', () => {
    expect(deriveSpecTableCells('scalar', { value: 3.14159, unit_id: 'u' } as never, 'A', 2)).toEqual({
      min: '—',
      typical: '3.14 A',
      max: '—',
    });
  });

  it('collapses a non-numeric field to a single formatted value', () => {
    expect(deriveSpecTableCells('boolean', { value: true } as never, null)).toMatchObject({
      min: '—',
      max: '—',
    });
  });
});
