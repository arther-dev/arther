import * as z from 'zod/v4';
import type { NormalizedImport } from './normalize';

/**
 * F7.4/F7.7 — per-element review decisions, keyed by the normalised
 * structure's stable keys and persisted in `import_sessions.decisions` so a
 * refresh loses nothing. Corrections edit the *normalised* import (rename,
 * re-unit, re-categorise, skip); the plan is then recomputed by the
 * reconciler — decisions never edit the plan directly, so the diff and the
 * commit can't drift apart.
 */

export const componentDecisionSchema = z.strictObject({
    skip: z.boolean().optional(),
    name: z.string().trim().min(1).optional(),
  });

export const fieldDecisionSchema = z.strictObject({
    skip: z.boolean().optional(),
    name: z.string().trim().min(1).optional(),
    unitId: z.string().uuid().nullable().optional(),
    category: z.string().trim().min(1).optional(),
  });

export const importDecisionsSchema = z.strictObject({
    components: z.record(z.string(), componentDecisionSchema).default({}),
    fields: z.record(z.string(), fieldDecisionSchema).default({}),
  });
export type ImportDecisions = z.infer<typeof importDecisionsSchema>;

export const EMPTY_DECISIONS: ImportDecisions = { components: {}, fields: {} };

/** Pure: normalised import + decisions → the import the reconciler sees. */
export function applyDecisions(
  incoming: NormalizedImport,
  decisions: ImportDecisions,
): NormalizedImport {
  const skippedComponents = new Set(
    Object.entries(decisions.components)
      .filter(([, d]) => d.skip)
      .map(([key]) => key),
  );
  const componentName = (key: string, original: string) =>
    decisions.components[key]?.name ?? original;

  const mapFields = (fields: NormalizedImport['productFields']) =>
    fields
      .filter((f) => !decisions.fields[f.key]?.skip)
      .map((f) => {
        const d = decisions.fields[f.key];
        if (!d) return f;
        const unitId = d.unitId !== undefined ? d.unitId : f.unitId;
        return {
          ...f,
          name: d.name ?? f.name,
          category: d.category ?? f.category,
          unitId,
          // A unit correction re-points the value's unit too (scalar family
          // carries unit_id inside the value).
          value: reUnitValue(f.value, unitId),
        };
      });

  // Parent links follow renames; a skipped parent promotes its children to
  // the top level rather than dangling.
  const effectiveParentName = (parentName: string | null): string | null => {
    if (!parentName) return null;
    const parent = incoming.components.find(
      (p) => p.name.toLowerCase() === parentName.toLowerCase(),
    );
    if (!parent) return parentName;
    if (skippedComponents.has(parent.key)) return null;
    return componentName(parent.key, parent.name);
  };

  return {
    ...incoming,
    productFields: mapFields(incoming.productFields),
    components: incoming.components
      .filter((c) => !skippedComponents.has(c.key))
      .map((c) => ({
        ...c,
        name: componentName(c.key, c.name),
        parentName: effectiveParentName(c.parentName),
        fields: mapFields(c.fields),
      })),
  };
}

function reUnitValue(
  value: NormalizedImport['productFields'][number]['value'],
  unitId: string | null,
): NormalizedImport['productFields'][number]['value'] {
  if (value === null) return null;
  if (typeof value === 'object' && 'unit_id' in value) {
    if (unitId === null) return null; // unit cleared → value can't stand
    return { ...value, unit_id: unitId };
  }
  return value;
}
