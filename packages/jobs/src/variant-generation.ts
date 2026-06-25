import type { PromptField, ResolverEntry } from '@arther/ai-gateway';
import { formatFieldValue, type ResolvedSpecEntry } from '@arther/types';

/**
 * V.5 — turn a variant's RESOLVED spec (base + deltas, override-aware; from
 * `loadResolvedVariantSpec`) into the generation inputs the section generator
 * consumes. A variant is generated exactly like a base product — the generator
 * stays variant-agnostic — but grounded in the variant's resolved values, so the
 * prose embeds each variant's own numbers. Pure: unit lookup is injected, so this
 * is unit-testable without a DB.
 *
 * Only fields with a real value AND a current version are citable (the same gate
 * the base generation applies): the spec token anchors to the field's version,
 * while the displayed value is the variant's resolved (possibly overridden) one.
 */

export type UnitSymbol = (unitId: string | null) => string | undefined;

function display(entry: ResolvedSpecEntry, unitSymbol: UnitSymbol): string {
  return formatFieldValue(entry.type, entry.value, unitSymbol(entry.unitId));
}

function isCitable(entry: ResolvedSpecEntry): boolean {
  return entry.currentVersionId !== null && entry.value !== null;
}

/** The zero-hallucination resolver entries for a variant's generation. */
export function variantResolverEntries(
  entries: ReadonlyArray<ResolvedSpecEntry>,
  productId: string,
  unitSymbol: UnitSymbol,
): ResolverEntry[] {
  return entries.filter(isCitable).map((e) => ({
    fieldId: e.fieldId,
    fieldVersionId: e.currentVersionId as string,
    displayValue: display(e, unitSymbol),
    unitId: e.unitId,
    productId,
    componentId: e.componentId,
  }));
}

/** The prompt fields offered to one section (those whose category it covers). */
export function variantPromptFields(
  entries: ReadonlyArray<ResolvedSpecEntry>,
  categories: ReadonlySet<string>,
  unitSymbol: UnitSymbol,
): PromptField[] {
  return entries
    .filter((e) => isCitable(e) && categories.has(e.category))
    .map((e) => ({
      fieldId: e.fieldId,
      name: e.name,
      category: e.category,
      value: display(e, unitSymbol),
      owner: e.owner === 'component' ? (e.componentName ?? 'component') : 'product',
    }));
}
