/**
 * G6.8 — spec coverage aggregation. Pure: given the (field_id, document_id)
 * reference rows for a product's documents, compute how many distinct documents
 * reference each field, and how many documents reference anything at all. A field
 * is "covered" when its count is > 0, "uncovered" (a coverage gap) otherwise. The
 * DB helper fetches the rows under RLS; this turns them into the per-field tally
 * the coverage view renders, so the counting logic is testable without a DB.
 */
export interface SpecCoverageRef {
  fieldId: string;
  documentId: string;
}

export interface SpecCoverage {
  /** field_id → distinct documents referencing it (absent ⇒ uncovered). */
  documentCountByField: Map<string, number>;
  /** distinct documents that reference at least one field of the product. */
  documentCount: number;
}

export function aggregateSpecCoverage(refs: readonly SpecCoverageRef[]): SpecCoverage {
  const docsByField = new Map<string, Set<string>>();
  const coveredDocs = new Set<string>();
  for (const { fieldId, documentId } of refs) {
    coveredDocs.add(documentId);
    let set = docsByField.get(fieldId);
    if (!set) {
      set = new Set();
      docsByField.set(fieldId, set);
    }
    set.add(documentId);
  }
  const documentCountByField = new Map<string, number>();
  for (const [fieldId, set] of docsByField) documentCountByField.set(fieldId, set.size);
  return { documentCountByField, documentCount: coveredDocs.size };
}

/**
 * Covered / total over a set of field ids (covered = referenced by ≥ 1 document).
 * Duplicate ids are counted once, so the caller can pass a product's full field
 * list (product-level + every component) without pre-deduping.
 */
export function summariseCoverage(
  fieldIds: readonly string[],
  documentCountByField: ReadonlyMap<string, number>,
): { covered: number; total: number } {
  const unique = new Set(fieldIds);
  let covered = 0;
  for (const id of unique) {
    if ((documentCountByField.get(id) ?? 0) > 0) covered += 1;
  }
  return { covered, total: unique.size };
}
