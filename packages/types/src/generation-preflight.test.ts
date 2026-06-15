import { describe, expect, it } from 'vitest';
import { computeGenerationReadiness, type PreflightField } from './generation-preflight';

const field = (over: Partial<PreflightField>): PreflightField => ({
  name: 'Field',
  category: 'Electrical',
  required: false,
  populated: true,
  owner: 'product',
  ...over,
});

describe('computeGenerationReadiness', () => {
  it('maps fields onto sections by category and counts populated vs empty', () => {
    const readiness = computeGenerationReadiness(
      [
        { name: 'Specifications', categories: ['Electrical', 'Mechanical'] },
        { name: 'Safety', categories: ['Safety'] },
      ],
      [
        field({ name: 'Voltage', category: 'Electrical', populated: true }),
        field({ name: 'Weight', category: 'Mechanical', populated: false }),
        field({ name: 'IP rating', category: 'Safety', populated: true }),
      ],
    );
    const specs = readiness.sections[0]!;
    expect(specs.total).toBe(2);
    expect(specs.populated).toBe(1);
    expect(specs.empty).toBe(1);
    expect(readiness.totals).toEqual({ total: 3, populated: 2, empty: 1, requiredEmpty: 0 });
  });

  it('flags required-but-empty fields as placeholders, with component attribution', () => {
    const readiness = computeGenerationReadiness(
      [{ name: 'Electrical', categories: ['Electrical'] }],
      [
        field({ name: 'Max current', category: 'Electrical', required: true, populated: false, owner: 'component', componentName: 'Controller' }),
        field({ name: 'Voltage', category: 'Electrical', required: true, populated: true }),
      ],
    );
    expect(readiness.totals.requiredEmpty).toBe(1);
    expect(readiness.sections[0]!.requiredEmpty).toEqual([
      { name: 'Max current', owner: 'component', componentName: 'Controller' },
    ]);
  });

  it('reports categories a section asks for but the product has no field in', () => {
    const readiness = computeGenerationReadiness(
      [{ name: 'Specifications', categories: ['Electrical', 'Thermal'] }],
      [field({ category: 'Electrical' })],
    );
    expect(readiness.sections[0]!.unmappedCategories).toEqual(['Thermal']);
  });

  it('lists fields that fall in no section — they will not be injected', () => {
    const readiness = computeGenerationReadiness(
      [{ name: 'Electrical', categories: ['Electrical'] }],
      [field({ name: 'Orphan', category: 'Compliance' })],
    );
    expect(readiness.uncategorizedFields).toEqual([{ name: 'Orphan', owner: 'product' }]);
    expect(readiness.sections[0]!.total).toBe(0);
  });

  it('counts a field shared across two sections once in totals, twice per section', () => {
    const readiness = computeGenerationReadiness(
      [
        { name: 'A', categories: ['Shared'] },
        { name: 'B', categories: ['Shared'] },
      ],
      [field({ category: 'Shared' })],
    );
    expect(readiness.sections[0]!.total).toBe(1);
    expect(readiness.sections[1]!.total).toBe(1);
    expect(readiness.totals.total).toBe(1);
    expect(readiness.uncategorizedFields).toHaveLength(0);
  });
});
