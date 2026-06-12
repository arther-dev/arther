import type { FieldValue } from '@arther/types';
import type { ImportableFieldType } from './interpretation';
import type { NormalizedComponent, NormalizedField, NormalizedImport } from './normalize';

/**
 * F7.3 — the SpecReconciler: normalised incoming payload vs. current database
 * state → a structured, ordered mutation plan (spec §6.4). Additive by
 * default: fields absent from the incoming payload are flagged, never
 * deleted; existing values are only ever *changed* through the same
 * version-appending RPC as a hand edit. Both file import and the deferred
 * webhook sync call this one function — they differ only in how the payload
 * was normalised.
 *
 * Mutation `key`s are stable across recomputation (derived from the
 * normalised structure, which is itself position-keyed), so per-element
 * review decisions survive refreshes and re-renders (F7.7).
 */

export interface ExistingField {
  id: string;
  name: string;
  type: string;
  value: FieldValue | null;
}

export interface ExistingComponentState {
  id: string;
  name: string;
  /** Already attached to the target product (re-import case). */
  attached: boolean;
  fields: ExistingField[];
}

export interface CurrentSpecState {
  /** Null on first import — the plan then starts with create_product. */
  product: { id: string; name: string; fields: ExistingField[] } | null;
  /** Workspace components relevant to the incoming names (+ attached ones). */
  components: ExistingComponentState[];
}

interface MutationBase {
  key: string;
  /** Owner context for review rendering ("Product" or the component name). */
  ownerLabel: string;
}

export type PlannedMutation =
  | (MutationBase & { kind: 'create_product'; name: string; description: string | null })
  | (MutationBase & {
      kind: 'create_component';
      ckey: string;
      name: string;
      componentType: 'assembly' | 'module' | 'part';
      sheet: string | null;
    })
  | (MutationBase & {
      kind: 'attach_component';
      /** Either a fresh component from this plan (ckey) or an existing one. */
      ckey: string | null;
      componentId: string | null;
      componentName: string;
      parentCkey: string | null;
      parentComponentId: string | null;
      quantity: number;
      /** True when the name matched an existing library component. */
      matchedExisting: boolean;
    })
  | (MutationBase & {
      kind: 'create_field';
      owner: { kind: 'product' } | { kind: 'component'; ckey: string | null; componentId: string | null };
      fieldKey: string;
      name: string;
      fieldType: ImportableFieldType;
      category: string;
      unitId: string | null;
      options: string[] | null;
      conditions: string | null;
      value: FieldValue | null;
      source: { sheet: string; row: number } | null;
    })
  | (MutationBase & {
      kind: 'set_value';
      fieldId: string;
      fieldKey: string;
      name: string;
      fieldType: ImportableFieldType;
      oldValue: FieldValue | null;
      newValue: FieldValue;
      source: { sheet: string; row: number } | null;
    })
  | (MutationBase & { kind: 'unchanged'; fieldId: string; name: string })
  | (MutationBase & {
      kind: 'type_conflict';
      fieldId: string;
      name: string;
      existingType: string;
      incomingType: ImportableFieldType;
    })
  | (MutationBase & { kind: 'missing_from_sheet'; fieldId: string; name: string });

export interface ImportPlanSummary {
  unchanged: number;
  changed: number;
  added: number;
  missing: number;
  typeConflicts: number;
  newComponents: number;
  matchedComponents: number;
}

export interface ImportPlan {
  mutations: PlannedMutation[];
  summary: ImportPlanSummary;
}

/** The kinds the commit RPC applies; everything else is review-display only. */
export const APPLIED_MUTATION_KINDS = [
  'create_product',
  'create_component',
  'attach_component',
  'create_field',
  'set_value',
] as const;

export function reconcile(incoming: NormalizedImport, current: CurrentSpecState): ImportPlan {
  const mutations: PlannedMutation[] = [];

  if (current.product === null) {
    mutations.push({
      kind: 'create_product',
      key: 'product',
      ownerLabel: 'Product',
      name: incoming.productName,
      description: incoming.productDescription,
    });
  }

  // Components parents-first so the RPC can resolve nesting as it inserts.
  const byName = new Map(current.components.map((c) => [c.name.toLowerCase(), c]));
  for (const component of orderParentsFirst(incoming.components)) {
    const existing = byName.get(component.name.toLowerCase()) ?? null;
    const parent = component.parentName
      ? incoming.components.find(
          (c) => c.name.toLowerCase() === component.parentName!.toLowerCase(),
        ) ?? null
      : null;
    const parentExisting = parent ? byName.get(parent.name.toLowerCase()) ?? null : null;
    if (!existing) {
      mutations.push({
        kind: 'create_component',
        key: `${component.key}.create`,
        ownerLabel: component.name,
        ckey: component.key,
        name: component.name,
        componentType: component.componentType,
        sheet: component.sheet,
      });
    }
    if (!existing || !existing.attached) {
      mutations.push({
        kind: 'attach_component',
        key: `${component.key}.attach`,
        ownerLabel: component.name,
        ckey: existing ? null : component.key,
        componentId: existing?.id ?? null,
        componentName: component.name,
        parentCkey: parent && !parentExisting ? parent.key : null,
        parentComponentId: parentExisting?.id ?? null,
        quantity: component.quantity,
        matchedExisting: existing !== null,
      });
    }
    diffFields(
      component.fields,
      existing?.fields ?? [],
      component.name,
      { kind: 'component', ckey: existing ? null : component.key, componentId: existing?.id ?? null },
      mutations,
    );
  }

  diffFields(
    incoming.productFields,
    current.product?.fields ?? [],
    'Product',
    { kind: 'product' },
    mutations,
  );

  return { mutations, summary: summarize(mutations) };
}

function diffFields(
  incoming: NormalizedField[],
  existing: ExistingField[],
  ownerLabel: string,
  owner: { kind: 'product' } | { kind: 'component'; ckey: string | null; componentId: string | null },
  mutations: PlannedMutation[],
): void {
  const matched = new Set<string>();
  for (const field of incoming) {
    const match = existing.find((e) => e.name.toLowerCase() === field.name.toLowerCase()) ?? null;
    if (!match) {
      mutations.push({
        kind: 'create_field',
        key: field.key,
        ownerLabel,
        owner,
        fieldKey: field.key,
        name: field.name,
        fieldType: field.type,
        category: field.category,
        unitId: field.unitId,
        options: field.options,
        conditions: field.conditions,
        value: field.value,
        source: field.source,
      });
      continue;
    }
    matched.add(match.id);
    if (match.type !== field.type) {
      // Types never change through import (versions + overrides depend on
      // them) — surfaced for review; the field is edited in-app afterwards.
      mutations.push({
        kind: 'type_conflict',
        key: field.key,
        ownerLabel,
        fieldId: match.id,
        name: match.name,
        existingType: match.type,
        incomingType: field.type,
      });
      continue;
    }
    if (field.value === null || canonicalJson(field.value) === canonicalJson(match.value)) {
      mutations.push({
        kind: 'unchanged',
        key: field.key,
        ownerLabel,
        fieldId: match.id,
        name: match.name,
      });
      continue;
    }
    mutations.push({
      kind: 'set_value',
      key: field.key,
      ownerLabel,
      fieldId: match.id,
      fieldKey: field.key,
      name: match.name,
      fieldType: field.type,
      oldValue: match.value,
      newValue: field.value,
      source: field.source,
    });
  }
  // Additive by default: absent fields are flagged for review, never deleted.
  for (const e of existing) {
    if (!matched.has(e.id)) {
      mutations.push({
        kind: 'missing_from_sheet',
        key: `missing.${e.id}`,
        ownerLabel,
        fieldId: e.id,
        name: e.name,
      });
    }
  }
}

/** Stable single-level topological order; orphaned parents fall back flat. */
function orderParentsFirst(components: NormalizedComponent[]): NormalizedComponent[] {
  const roots = components.filter(
    (c) =>
      !c.parentName ||
      !components.some((p) => p.name.toLowerCase() === c.parentName!.toLowerCase()),
  );
  const children = components.filter((c) => !roots.includes(c));
  return [...roots, ...children];
}

function summarize(mutations: PlannedMutation[]): ImportPlanSummary {
  const summary: ImportPlanSummary = {
    unchanged: 0,
    changed: 0,
    added: 0,
    missing: 0,
    typeConflicts: 0,
    newComponents: 0,
    matchedComponents: 0,
  };
  for (const m of mutations) {
    if (m.kind === 'unchanged') summary.unchanged += 1;
    else if (m.kind === 'set_value') summary.changed += 1;
    else if (m.kind === 'create_field') summary.added += 1;
    else if (m.kind === 'missing_from_sheet') summary.missing += 1;
    else if (m.kind === 'type_conflict') summary.typeConflicts += 1;
    else if (m.kind === 'create_component') summary.newComponents += 1;
    else if (m.kind === 'attach_component' && m.matchedExisting) summary.matchedComponents += 1;
  }
  return summary;
}

/** Order-insensitive deep equality for FieldValue JSON. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}
