import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDomainOwner } from '@arther/types';
import type {
  DocumentId,
  DomainOwnerResolution,
  OwnershipConfigEntry,
} from '@arther/types';

/**
 * G6.3 — resolve the domain owner for each given field category in the context
 * of one document, via the four-step fallback (`@arther/types` resolveDomainOwner:
 * product override ▸ workspace category default ▸ document owner ▸ workspace
 * admin). Reads `domain_ownership_config` (member-readable), the document's
 * product + owner, and the workspace owner (final backstop) — all under RLS.
 *
 * The two-speed propagation (G6.2) and review-item creation (G6.4) call this to
 * set `section_review_items.assigned_to`; a `category → owner` map keyed by the
 * distinct categories of a document's stale references (G6.1) is exactly the
 * routing input they need.
 */
export interface ResolvedCategoryOwner extends DomainOwnerResolution {
  category: string;
}

export async function resolveDomainOwnersForDocument(
  client: SupabaseClient,
  documentId: DocumentId,
  categories: readonly string[],
): Promise<Map<string, ResolvedCategoryOwner>> {
  const result = new Map<string, ResolvedCategoryOwner>();
  const distinct = [...new Set(categories)];
  if (distinct.length === 0) return result;

  const { data: doc, error: docErr } = await client
    .from('documents')
    .select('workspace_id, product_id, owner_id')
    .eq('id', documentId)
    .single();
  if (docErr) throw new Error(`resolveDomainOwnersForDocument: ${docErr.message}`);

  const { data: ws, error: wsErr } = await client
    .from('workspaces')
    .select('owner_id')
    .eq('id', doc.workspace_id)
    .single();
  if (wsErr) throw new Error(`resolveDomainOwnersForDocument: ${wsErr.message}`);

  // Only the rows that can possibly match: a workspace default, or an override
  // for *this* document's product. Other products' overrides are irrelevant.
  const { data: configRows, error: cfgErr } = await client
    .from('domain_ownership_config')
    .select('field_category, product_id, owner_user_id')
    .eq('workspace_id', doc.workspace_id)
    .in('field_category', distinct)
    .or(`product_id.is.null,product_id.eq.${doc.product_id}`);
  if (cfgErr) throw new Error(`resolveDomainOwnersForDocument: ${cfgErr.message}`);

  const config: OwnershipConfigEntry[] = (configRows ?? []).map((r) => ({
    fieldCategory: r.field_category as string,
    productId: (r.product_id as string | null) ?? null,
    ownerUserId: r.owner_user_id as string,
  }));

  for (const category of distinct) {
    const resolution = resolveDomainOwner({
      category,
      productId: doc.product_id as string,
      documentOwnerId: (doc.owner_id as string | null) ?? null,
      workspaceOwnerId: (ws.owner_id as string | null) ?? null,
      config,
    });
    result.set(category, { category, ...resolution });
  }
  return result;
}
