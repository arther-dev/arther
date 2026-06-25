import { describe, expect, it } from 'vitest';
import type { ResolvedSpecEntry } from '@arther/types';
import { variantPromptFields, variantResolverEntries } from './variant-generation';

function entry(over: Partial<ResolvedSpecEntry>): ResolvedSpecEntry {
  return {
    fieldId: 'f1',
    name: 'Coil voltage',
    category: 'Electrical',
    type: 'scalar',
    value: { value: 24 } as never,
    unitId: 'u-volt',
    currentVersionId: 'f1-v1',
    owner: 'product',
    componentId: null,
    componentName: null,
    origin: 'base',
    overridden: false,
    ...over,
  };
}

const sym = (id: string | null) => (id === 'u-volt' ? 'V' : undefined);

describe('variantResolverEntries', () => {
  it('keeps only citable fields (a value AND a current version) and maps the linkage', () => {
    const entries = [
      entry({ fieldId: 'f1' }),
      entry({ fieldId: 'f2', currentVersionId: null }), // no version → not citable
      entry({ fieldId: 'f3', value: null }), // no value → not citable
      entry({ fieldId: 'f4', componentId: 'c1', owner: 'component' }),
    ];
    const out = variantResolverEntries(entries, 'p1', sym);
    expect(out.map((e) => e.fieldId)).toEqual(['f1', 'f4']);
    const f1 = out.find((e) => e.fieldId === 'f1')!;
    expect(f1.fieldVersionId).toBe('f1-v1');
    expect(f1.productId).toBe('p1');
    expect(f1.componentId).toBeNull();
    expect(out.find((e) => e.fieldId === 'f4')!.componentId).toBe('c1');
  });
});

describe('variantPromptFields', () => {
  it('offers only the citable fields whose category the section covers', () => {
    const entries = [
      entry({ fieldId: 'f1', category: 'Electrical' }),
      entry({ fieldId: 'f2', category: 'Mechanical' }),
      entry({ fieldId: 'f3', category: 'Electrical', currentVersionId: null }), // not citable
    ];
    const fields = variantPromptFields(entries, new Set(['Electrical']), sym);
    expect(fields.map((f) => f.fieldId)).toEqual(['f1']);
    expect(fields[0]!.owner).toBe('product');
  });

  it('labels component-owned fields by their component name', () => {
    const fields = variantPromptFields(
      [entry({ fieldId: 'f4', owner: 'component', componentName: 'Relay' })],
      new Set(['Electrical']),
      sym,
    );
    expect(fields[0]!.owner).toBe('Relay');
  });
});
