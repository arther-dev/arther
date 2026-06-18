import type { FieldType, FieldValue } from './field-values';
import type { DeltaType } from './variant';

/**
 * V.2 — resolved-spec computation (Product Variants §3.3). A variant's resolved
 * spec is **computed, never stored**: start from the base product's assembled spec
 * (its own fields + every attached component's fields) and apply the variant's
 * deltas in creation order. The result is a flat field set structurally identical
 * to a base product's — the AI generator and the portal consume it with no
 * variant-specific logic.
 *
 * Pure: the db layer supplies the base entries and the field sets for any
 * component a SWAP/ADD pulls in (`componentFieldsById`); this applies the deltas
 * and reports validation warnings (later delta wins on conflict, §3.2). No I/O.
 */

export interface ResolvedSpecEntry {
  fieldId: string;
  name: string;
  category: string;
  type: FieldType;
  value: FieldValue | null;
  unitId: string | null;
  currentVersionId: string | null;
  owner: 'product' | 'component';
  componentId: string | null;
  componentName: string | null;
  /** Where this entry came from relative to the base spec. */
  origin: 'base' | 'swapped' | 'added';
  /** A SCALAR_OVERRIDE delta changed this field's value for the variant. */
  overridden: boolean;
}

export interface VariantResolutionWarning {
  deltaIndex: number;
  type: DeltaType;
  message: string;
}

export interface VariantDeltaForResolution {
  type: DeltaType;
  componentId?: string | null;
  fieldId?: string | null;
  overrideValue?: FieldValue | null;
  replacementComponentId?: string | null;
  newComponentId?: string | null;
}

export interface ResolveVariantSpecInput {
  /** The base product's assembled spec (product + component fields), in order. */
  base: ResolvedSpecEntry[];
  /** Field sets for components a SWAP/ADD introduces, keyed by component id. */
  componentFieldsById: Record<string, ResolvedSpecEntry[]>;
  /** Component display names (for tagging swapped/added entries), keyed by id. */
  componentNamesById: Record<string, string>;
  /** The variant's deltas, in application (created_at) order. */
  deltas: VariantDeltaForResolution[];
}

export interface ResolveVariantSpecResult {
  entries: ResolvedSpecEntry[];
  warnings: VariantResolutionWarning[];
}

function cloneEntry(e: ResolvedSpecEntry, origin: ResolvedSpecEntry['origin'], componentName: string | null): ResolvedSpecEntry {
  return { ...e, origin, componentName: componentName ?? e.componentName, overridden: false };
}

export function resolveVariantSpec(input: ResolveVariantSpecInput): ResolveVariantSpecResult {
  const entries: ResolvedSpecEntry[] = input.base.map((e) => ({ ...e, origin: 'base', overridden: false }));
  const warnings: VariantResolutionWarning[] = [];
  const warn = (deltaIndex: number, type: DeltaType, message: string) =>
    warnings.push({ deltaIndex, type, message });

  input.deltas.forEach((delta, i) => {
    switch (delta.type) {
      case 'COMPONENT_REMOVE': {
        const before = entries.length;
        for (let k = entries.length - 1; k >= 0; k -= 1) {
          if (entries[k]!.componentId === delta.componentId) entries.splice(k, 1);
        }
        if (entries.length === before) {
          warn(i, delta.type, 'Removes a component that is not in this variant’s spec.');
        }
        break;
      }
      case 'COMPONENT_SWAP': {
        const firstIndex = entries.findIndex((e) => e.componentId === delta.componentId);
        if (firstIndex === -1) {
          warn(i, delta.type, 'Swaps a component that is not in this variant’s spec.');
          break;
        }
        // Remove every field of the swapped-out component.
        for (let k = entries.length - 1; k >= 0; k -= 1) {
          if (entries[k]!.componentId === delta.componentId) entries.splice(k, 1);
        }
        const replacementId = delta.replacementComponentId ?? '';
        const replacementFields = input.componentFieldsById[replacementId] ?? [];
        if (replacementFields.length === 0) {
          warn(i, delta.type, 'The replacement component has no fields (or was not found).');
        }
        const insertAt = Math.min(firstIndex, entries.length);
        const name = input.componentNamesById[replacementId] ?? null;
        entries.splice(
          insertAt,
          0,
          ...replacementFields.map((e) => cloneEntry(e, 'swapped', name)),
        );
        break;
      }
      case 'COMPONENT_ADD': {
        const addId = delta.newComponentId ?? '';
        const addFields = input.componentFieldsById[addId] ?? [];
        if (addFields.length === 0) {
          warn(i, delta.type, 'The added component has no fields (or was not found).');
        }
        const name = input.componentNamesById[addId] ?? null;
        entries.push(...addFields.map((e) => cloneEntry(e, 'added', name)));
        break;
      }
      case 'SCALAR_OVERRIDE': {
        const entry = entries.find(
          (e) => e.fieldId === delta.fieldId && (delta.componentId == null || e.componentId === delta.componentId),
        );
        if (!entry) {
          warn(i, delta.type, 'Overrides a field that is not present in this variant (it may have been removed).');
          break;
        }
        entry.value = delta.overrideValue ?? null;
        entry.overridden = true;
        break;
      }
      default:
        break;
    }
  });

  return { entries, warnings };
}
