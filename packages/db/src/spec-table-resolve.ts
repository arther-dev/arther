import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductId, SpecFieldResolution, WorkspaceId } from '@arther/types';
import { loadGenerationFields } from './generation-context';
import { listUnits } from './spec';

/**
 * G4 (live data blocks) — resolve a product's spec fields to the live values a
 * document's spec_table / chart blocks render at view time (spec §3.1: read from
 * the spec database, never frozen into the block). Reuses the generation-context
 * graph load (product + attached components, current versions) and the unit
 * registry, keyed by field id for the renderer. Under RLS (member read).
 */
export async function resolveSpecFields(
  client: SupabaseClient,
  productId: ProductId,
  workspaceId: WorkspaceId,
): Promise<SpecFieldResolution> {
  const [fields, units] = await Promise.all([
    loadGenerationFields(client, productId),
    listUnits(client, workspaceId),
  ]);
  const unitSymbol = new Map(units.map((u) => [u.id, u.symbol]));

  const resolution: SpecFieldResolution = {};
  for (const f of fields) {
    resolution[f.id] = {
      name: f.name,
      type: f.type,
      value: f.value,
      unitSymbol: f.unit_id ? (unitSymbol.get(f.unit_id) ?? null) : null,
      ownerName: f.owner === 'component' ? f.component_name : null,
    };
  }
  return resolution;
}
