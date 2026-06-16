import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateSpecCoverage, type ProductId, type SpecCoverage } from '@arther/types';

/**
 * G6.8 — spec coverage for a product: which of its spec fields are referenced by
 * at least one of its documents, and by how many. Computed at read time from
 * `block_spec_references` (the staleness anchor the generator writes), scoped to
 * the product's live (non-archived) documents. Read under RLS via the user
 * client — members see only their workspace's references.
 *
 * Two reads + a JS aggregate rather than one grouped join: PostgREST can't
 * `count(distinct …)` across a `documents.product_id` filter, and the row volume
 * here (a product's references) is small. The pure aggregation lives in
 * `@arther/types` so the counting is unit-tested without a database.
 *
 * Coverage counts the product's documents regardless of lifecycle state — the
 * publish flow is gated this phase, so a strict "published only" filter would
 * read empty. It narrows to published documents once that pipeline lands.
 */
export async function getSpecCoverageForProduct(
  client: SupabaseClient,
  productId: ProductId,
): Promise<SpecCoverage> {
  const { data: docs, error: docErr } = await client
    .from('documents')
    .select('id')
    .eq('product_id', productId)
    .is('archived_at', null);
  if (docErr) throw new Error(`getSpecCoverageForProduct(docs): ${docErr.message}`);
  const docIds = (docs ?? []).map((d) => d.id as string);
  if (docIds.length === 0) return { documentCountByField: new Map(), documentCount: 0 };

  const { data: refs, error: refErr } = await client
    .from('block_spec_references')
    .select('field_id, document_id')
    .in('document_id', docIds);
  if (refErr) throw new Error(`getSpecCoverageForProduct(refs): ${refErr.message}`);

  return aggregateSpecCoverage(
    (refs ?? []).map((r) => ({
      fieldId: r.field_id as string,
      documentId: r.document_id as string,
    })),
  );
}
