import { describe, expect, it } from 'vitest';
import { formatFieldValue } from './format';
import { wouldCreateReferenceCycle } from './reference-graph';

const UNIT = '0d4ee021-92eb-44a5-a1a4-6b04f7e3e159';

describe('formatFieldValue', () => {
  it('renders every type the way the spec shows them (§4 examples)', () => {
    expect(formatFieldValue('scalar', { value: 36, unit_id: UNIT }, 'V')).toBe('36 V');
    expect(formatFieldValue('range', { min: -20, max: 85, unit_id: UNIT }, '°C')).toBe(
      '-20 to 85 °C',
    );
    expect(
      formatFieldValue(
        'toleranced',
        { nominal: 24, tolerance: 5, tolerance_type: 'percentage', unit_id: UNIT },
        'V',
      ),
    ).toBe('24 V ±5%');
    expect(
      formatFieldValue(
        'toleranced',
        { nominal: 10, tolerance: 0.5, tolerance_type: 'absolute', unit_id: UNIT },
        'mm',
      ),
    ).toBe('10 mm ±0.5 mm');
    expect(formatFieldValue('boolean', { value: true })).toBe('Yes');
    expect(formatFieldValue('enum', { selected: 'IP67', options: ['IP65', 'IP67'] })).toBe('IP67');
    expect(
      formatFieldValue('multi_enum', { selected: ['CE', 'UL'], options: ['CE', 'UL', 'CSA'] }),
    ).toBe('CE, UL');
    expect(
      formatFieldValue('table', {
        columns: [
          { id: 'a', name: 'A', unit_id: UNIT, role: 'independent' },
          { id: 'b', name: 'B', unit_id: UNIT, role: 'dependent' },
        ],
        rows: [{ id: 'r', values: { a: 1, b: 2 } }],
        interpolation: 'linear',
      }),
    ).toBe('Table (1×2)');
  });

  it('renders null as not-yet-entered', () => {
    expect(formatFieldValue('scalar', null, 'V')).toBe('—');
  });
});

describe('wouldCreateReferenceCycle', () => {
  it('blocks self-references and two-node cycles', () => {
    expect(wouldCreateReferenceCycle([], { from: 'a', to: 'a' })).toBe(true);
    expect(wouldCreateReferenceCycle([{ from: 'b', to: 'a' }], { from: 'a', to: 'b' })).toBe(true);
  });

  it('blocks longer cycles through intermediate components', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    expect(wouldCreateReferenceCycle(edges, { from: 'c', to: 'a' })).toBe(true);
  });

  it('allows acyclic references, including diamonds', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
    ];
    expect(wouldCreateReferenceCycle(edges, { from: 'c', to: 'd' })).toBe(false);
    expect(wouldCreateReferenceCycle(edges, { from: 'd', to: 'e' })).toBe(false);
  });
});
