import { describe, expect, it } from 'vitest';
import {
  DELTA_TYPES,
  deltaTypeLabel,
  describeVariantDelta,
  slugifyVariantName,
  variantDeltaInputSchema,
} from './variant';

const uuid = '00000000-0000-4000-8000-000000000000';
const uuid2 = '11111111-1111-4111-8111-111111111111';

describe('variantDeltaInputSchema (V.1)', () => {
  it('accepts a well-formed delta of each type', () => {
    expect(
      variantDeltaInputSchema.safeParse({
        type: 'SCALAR_OVERRIDE',
        componentId: uuid,
        fieldId: uuid2,
        overrideValue: { value: 5, unit_id: uuid },
      }).success,
    ).toBe(true);
    expect(
      variantDeltaInputSchema.safeParse({
        type: 'COMPONENT_SWAP',
        componentId: uuid,
        replacementComponentId: uuid2,
      }).success,
    ).toBe(true);
    expect(
      variantDeltaInputSchema.safeParse({ type: 'COMPONENT_REMOVE', componentId: uuid }).success,
    ).toBe(true);
    expect(
      variantDeltaInputSchema.safeParse({ type: 'COMPONENT_ADD', newComponentId: uuid }).success,
    ).toBe(true);
  });

  it('rejects a delta missing its type-specific fields', () => {
    // SCALAR_OVERRIDE without a field/value.
    expect(
      variantDeltaInputSchema.safeParse({ type: 'SCALAR_OVERRIDE', componentId: uuid }).success,
    ).toBe(false);
    // SWAP without a replacement.
    expect(
      variantDeltaInputSchema.safeParse({ type: 'COMPONENT_SWAP', componentId: uuid }).success,
    ).toBe(false);
    // COMPONENT_ADD with a non-uuid component.
    expect(
      variantDeltaInputSchema.safeParse({ type: 'COMPONENT_ADD', newComponentId: 'nope' }).success,
    ).toBe(false);
    // An unknown delta type.
    expect(variantDeltaInputSchema.safeParse({ type: 'FROBNICATE', componentId: uuid }).success).toBe(
      false,
    );
  });

  it('allows an optional position_after on COMPONENT_ADD', () => {
    expect(
      variantDeltaInputSchema.safeParse({
        type: 'COMPONENT_ADD',
        newComponentId: uuid,
        positionAfter: uuid2,
      }).success,
    ).toBe(true);
    expect(
      variantDeltaInputSchema.safeParse({
        type: 'COMPONENT_ADD',
        newComponentId: uuid,
        positionAfter: null,
      }).success,
    ).toBe(true);
  });
});

describe('variant helpers (V.1)', () => {
  it('labels and describes every delta type', () => {
    for (const type of DELTA_TYPES) {
      expect(deltaTypeLabel(type).length).toBeGreaterThan(0);
    }
    expect(describeVariantDelta({ type: 'SCALAR_OVERRIDE', fieldName: 'Voltage', componentName: 'PSU' })).toBe(
      'Override Voltage on PSU',
    );
    expect(
      describeVariantDelta({ type: 'COMPONENT_SWAP', componentName: 'A', replacementComponentName: 'B' }),
    ).toBe('Swap A for B');
    expect(describeVariantDelta({ type: 'COMPONENT_REMOVE', componentName: 'A' })).toBe('Remove A');
    expect(describeVariantDelta({ type: 'COMPONENT_ADD', newComponentName: 'C' })).toBe('Add C');
  });

  it('slugifies a variant name with a sane fallback', () => {
    expect(slugifyVariantName('High-Temperature Model')).toBe('high-temperature-model');
    expect(slugifyVariantName('  Câblage 24V  ')).toBe('cablage-24v');
    expect(slugifyVariantName('!!!')).toBe('variant');
    expect(slugifyVariantName('')).toBe('variant');
  });
});
