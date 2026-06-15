import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BriefEntityType,
  BriefFragmentId,
  ProductBriefId,
  UserId,
  WorkspaceId,
} from '@arther/types';

/**
 * Product Brief repository (G0.6) over the user-JWT client — RLS is active on
 * every call (ADR-010). Briefs are authoring content: members read, editors
 * write (migration 0004 `product_briefs`/`brief_fragments` policies). A brief
 * row is created lazily on the first fragment write, so an entity with no
 * narrative carries no empty parent row.
 */

export interface BriefFragmentRow {
  id: BriefFragmentId;
  brief_id: ProductBriefId;
  key: string;
  content: string;
  updated_by: UserId | null;
  updated_at: string;
}

export interface EntityBrief {
  briefId: ProductBriefId | null;
  fragments: BriefFragmentRow[];
}

const FRAGMENT_COLUMNS = 'id, brief_id, key, content, updated_by, updated_at';

/** The brief (if any) and its fragments for one product or component. */
export async function getEntityBrief(
  client: SupabaseClient,
  entityType: BriefEntityType,
  entityId: string,
): Promise<EntityBrief> {
  const { data: brief, error } = await client
    .from('product_briefs')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();
  if (error) throw new Error(`getEntityBrief: ${error.message}`);
  if (!brief) return { briefId: null, fragments: [] };

  const { data: fragments, error: fe } = await client
    .from('brief_fragments')
    .select(FRAGMENT_COLUMNS)
    .eq('brief_id', brief.id)
    .order('key');
  if (fe) throw new Error(`getEntityBrief.fragments: ${fe.message}`);
  return { briefId: brief.id as ProductBriefId, fragments: (fragments ?? []) as BriefFragmentRow[] };
}

/** Find the brief for an entity, creating it on demand (unique on entity). */
async function ensureBrief(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; entityType: BriefEntityType; entityId: string; userId: UserId },
): Promise<ProductBriefId> {
  const existing = await client
    .from('product_briefs')
    .select('id')
    .eq('entity_type', input.entityType)
    .eq('entity_id', input.entityId)
    .maybeSingle();
  if (existing.data) return existing.data.id as ProductBriefId;

  const { data, error } = await client
    .from('product_briefs')
    .insert({
      workspace_id: input.workspaceId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      created_by: input.userId,
    })
    .select('id')
    .single();
  if (error) {
    // A concurrent writer may have inserted first (unique entity constraint) —
    // re-read rather than fail the save.
    const retry = await client
      .from('product_briefs')
      .select('id')
      .eq('entity_type', input.entityType)
      .eq('entity_id', input.entityId)
      .maybeSingle();
    if (retry.data) return retry.data.id as ProductBriefId;
    throw new Error(`ensureBrief: ${error.message}`);
  }
  return data.id as ProductBriefId;
}

/** Create or update one named fragment on an entity's brief. */
export async function upsertBriefFragment(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    entityType: BriefEntityType;
    entityId: string;
    key: string;
    content: string;
    userId: UserId;
  },
): Promise<void> {
  const briefId = await ensureBrief(client, input);
  const { error } = await client.from('brief_fragments').upsert(
    {
      workspace_id: input.workspaceId,
      brief_id: briefId,
      key: input.key,
      content: input.content,
      updated_by: input.userId,
    },
    { onConflict: 'brief_id,key' },
  );
  if (error) throw new Error(`upsertBriefFragment: ${error.message}`);
}

/** Remove one fragment (e.g. clearing it back to "not yet added"). No-op if absent. */
export async function deleteBriefFragment(
  client: SupabaseClient,
  input: { entityType: BriefEntityType; entityId: string; key: string },
): Promise<void> {
  const { data: brief } = await client
    .from('product_briefs')
    .select('id')
    .eq('entity_type', input.entityType)
    .eq('entity_id', input.entityId)
    .maybeSingle();
  if (!brief) return;
  const { error } = await client
    .from('brief_fragments')
    .delete()
    .eq('brief_id', brief.id)
    .eq('key', input.key);
  if (error) throw new Error(`deleteBriefFragment: ${error.message}`);
}

export interface BriefKeyUsage {
  key: string;
  documentTypeName: string;
  sectionName: string;
  required: boolean;
}

/**
 * Which Document Type sections reference each brief fragment key — the
 * "referenced by" context the editing surface shows beside a fragment, and the
 * source of the expected-key list for an entity. Reads built-in (workspace_id
 * null) and this workspace's live types; RLS allows both.
 *
 * The downstream "needed by N documents" placeholder count (spec §5.7) arrives
 * with the block model (G3) — there are no documents to count against yet.
 */
export async function listBriefKeyUsage(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<BriefKeyUsage[]> {
  const { data: types, error } = await client
    .from('document_types')
    .select('id, name')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .is('archived_at', null);
  if (error) throw new Error(`listBriefKeyUsage.types: ${error.message}`);
  if (!types || types.length === 0) return [];

  const typeName = new Map(types.map((t) => [t.id as string, t.name as string]));
  const { data: sections, error: se } = await client
    .from('document_type_sections')
    .select('document_type_id, name, brief_fragment_keys, brief_required')
    .in(
      'document_type_id',
      types.map((t) => t.id),
    );
  if (se) throw new Error(`listBriefKeyUsage.sections: ${se.message}`);

  const usage: BriefKeyUsage[] = [];
  for (const section of sections ?? []) {
    const keys = Array.isArray(section.brief_fragment_keys) ? section.brief_fragment_keys : [];
    for (const key of keys) {
      usage.push({
        key: String(key),
        documentTypeName: typeName.get(section.document_type_id as string) ?? 'Document Type',
        sectionName: section.name as string,
        required: Boolean(section.brief_required),
      });
    }
  }
  return usage;
}
