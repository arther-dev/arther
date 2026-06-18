import { z } from 'zod';
import { requiredText, optionalText, TEXT_LIMITS } from './text';

/**
 * V.1 — the variant delta model (Product Variants §3.2). A variant is a named set
 * of **deltas** applied to its base product's spec; the resolved spec is computed
 * at query time (V.2), never stored. There are four delta types, each using a
 * different subset of the `variant_deltas` columns (0010):
 *
 *   • SCALAR_OVERRIDE — change one field's value on a component (`component_id`,
 *     `field_id`, `override_value`);
 *   • COMPONENT_SWAP — replace a component with another (`component_id`,
 *     `replacement_component_id`);
 *   • COMPONENT_REMOVE — drop a component from this variant (`component_id`);
 *   • COMPONENT_ADD — add a component (`new_component_id`, optional `position_after`).
 *
 * This module owns the pure shape + validation; the value of a SCALAR_OVERRIDE is
 * re-checked against the field's declared type at the write boundary (the field
 * type isn't known here).
 */

export const DELTA_TYPES = [
  'SCALAR_OVERRIDE',
  'COMPONENT_SWAP',
  'COMPONENT_REMOVE',
  'COMPONENT_ADD',
] as const;
export type DeltaType = (typeof DELTA_TYPES)[number];

export const DELTA_TYPE_LABELS: Record<DeltaType, string> = {
  SCALAR_OVERRIDE: 'Override a field value',
  COMPONENT_SWAP: 'Swap a component',
  COMPONENT_REMOVE: 'Remove a component',
  COMPONENT_ADD: 'Add a component',
};

export function deltaTypeLabel(type: DeltaType): string {
  return DELTA_TYPE_LABELS[type];
}

const uuid = z.string().uuid();

/**
 * A delta as the editor submits it — a discriminated union on `type` that enforces
 * exactly the columns each delta type uses. `override_value` is an opaque object
 * here (validated against the field's type at the boundary).
 */
export const variantDeltaInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SCALAR_OVERRIDE'),
    componentId: uuid,
    fieldId: uuid,
    overrideValue: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('COMPONENT_SWAP'),
    componentId: uuid,
    replacementComponentId: uuid,
  }),
  z.object({
    type: z.literal('COMPONENT_REMOVE'),
    componentId: uuid,
  }),
  z.object({
    type: z.literal('COMPONENT_ADD'),
    newComponentId: uuid,
    positionAfter: uuid.nullable().optional(),
  }),
]);
export type VariantDeltaInput = z.infer<typeof variantDeltaInputSchema>;

/** Create-a-variant contract; the slug is derived from the name by the repo. */
export const createVariantSchema = z.object({
  name: requiredText('Name the variant.'),
  description: optionalText(TEXT_LIMITS.notes),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

/** Derive a per-product-unique-able slug from a variant name. */
export function slugifyVariantName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'variant'
  );
}

/**
 * A pure, human-readable one-line summary of a delta, given name lookups for the
 * referenced entities (the editor/list render this without re-deriving wording).
 */
/**
 * V.4 — per-block variant scope (Product Variants §3.4). A block in the shared
 * variant-aware document is shown for a variant based on its scope:
 *   • ALL — shown for every variant (the default);
 *   • DERIVED — shown only when its gating component (`derivedComponentId`) is
 *     present in that variant's resolved spec (a REMOVE/never-ADD hides it);
 *   • MANUAL — shown only for the explicitly listed `variantIds`.
 */
export const BLOCK_VARIANT_SCOPE_MODES = ['ALL', 'DERIVED', 'MANUAL'] as const;
export type BlockVariantScopeMode = (typeof BLOCK_VARIANT_SCOPE_MODES)[number];

export const BLOCK_VARIANT_SCOPE_LABELS: Record<BlockVariantScopeMode, string> = {
  ALL: 'All variants',
  DERIVED: 'Where a component exists',
  MANUAL: 'Selected variants only',
};

export interface BlockVariantScope {
  mode: BlockVariantScopeMode;
  variantIds: string[];
  derivedComponentId: string | null;
}

/**
 * Pure — is a block shown when previewing/publishing a given variant? Defaults to
 * visible when unscoped (no row = ALL). DERIVED with no gating component can't be
 * decided, so it stays visible.
 */
export function isBlockVisibleForVariant(
  scope: BlockVariantScope | undefined,
  ctx: { variantId: string; componentIds: ReadonlySet<string> },
): boolean {
  if (!scope || scope.mode === 'ALL') return true;
  if (scope.mode === 'MANUAL') return scope.variantIds.includes(ctx.variantId);
  // DERIVED
  return scope.derivedComponentId == null ? true : ctx.componentIds.has(scope.derivedComponentId);
}

export function describeVariantDelta(
  delta: {
    type: DeltaType;
    componentName?: string | null;
    fieldName?: string | null;
    replacementComponentName?: string | null;
    newComponentName?: string | null;
  },
): string {
  const component = delta.componentName ?? 'a component';
  switch (delta.type) {
    case 'SCALAR_OVERRIDE':
      return `Override ${delta.fieldName ?? 'a field'} on ${component}`;
    case 'COMPONENT_SWAP':
      return `Swap ${component} for ${delta.replacementComponentName ?? 'another component'}`;
    case 'COMPONENT_REMOVE':
      return `Remove ${component}`;
    case 'COMPONENT_ADD':
      return `Add ${delta.newComponentName ?? 'a component'}`;
    default:
      return 'Delta';
  }
}
