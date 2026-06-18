import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlockVariantScopeMode, ComponentId, UserId, WorkspaceId } from '@arther/types';

/**
 * V.4 — per-block variant scope (Product Variants §3.4). One row per scoped block
 * in `block_variant_scopes` (0010, member-read / editor-write), keyed 1:1 to the
 * block. Absence of a row means ALL (shown for every variant), so we only store
 * rows for DERIVED / MANUAL blocks. Thin typed calls over the user-JWT client.
 */

export interface BlockVariantScopeRow {
  blockId: string;
  mode: BlockVariantScopeMode;
  variantIds: string[];
  derivedComponentId: string | null;
}

function toRow(raw: Record<string, unknown>): BlockVariantScopeRow {
  const variantIds = raw.variant_ids;
  return {
    blockId: raw.block_id as string,
    mode: raw.mode as BlockVariantScopeMode,
    variantIds: Array.isArray(variantIds)
      ? (variantIds as string[])
      : typeof variantIds === 'string'
        ? (JSON.parse(variantIds) as string[])
        : [],
    derivedComponentId: (raw.derived_component_id as string | null) ?? null,
  };
}

/** The scope rows for a set of blocks, keyed by block id (unscoped blocks absent). */
export async function loadBlockVariantScopes(
  client: SupabaseClient,
  blockIds: string[],
): Promise<Map<string, BlockVariantScopeRow>> {
  const ids = [...new Set(blockIds)].filter((b) => b.length > 0);
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from('block_variant_scopes')
    .select('block_id, mode, variant_ids, derived_component_id')
    .in('block_id', ids);
  if (error) throw new Error(`loadBlockVariantScopes: ${error.message}`);
  const map = new Map<string, BlockVariantScopeRow>();
  for (const r of data ?? []) {
    const row = toRow(r as Record<string, unknown>);
    map.set(row.blockId, row);
  }
  return map;
}

/**
 * Set a block's variant scope (upsert on `block_id`). ALL clears the variant
 * lists; DERIVED carries the gating component; MANUAL carries the variant list.
 */
export async function setBlockVariantScope(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    blockId: string;
    mode: BlockVariantScopeMode;
    variantIds?: string[];
    derivedComponentId?: ComponentId | null;
    userId: UserId;
  },
): Promise<void> {
  const { error } = await client.from('block_variant_scopes').upsert(
    {
      block_id: input.blockId,
      workspace_id: input.workspaceId,
      mode: input.mode,
      variant_ids: input.mode === 'MANUAL' ? (input.variantIds ?? []) : [],
      derived_component_id: input.mode === 'DERIVED' ? (input.derivedComponentId ?? null) : null,
      updated_by: input.userId,
    },
    { onConflict: 'block_id' },
  );
  if (error) throw new Error(`setBlockVariantScope: ${error.message}`);
}
