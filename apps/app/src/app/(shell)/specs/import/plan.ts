import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCurrentSpecState, type ImportSessionRow } from '@arther/db';
import {
  applyDecisions,
  importDecisionsSchema,
  reconcile,
  type ImportDecisions,
  type ImportPlan,
  type NormalizedImport,
} from '@arther/spec-import';
import type { WorkspaceId } from '@arther/types';

/**
 * Shared by the review pages and the commit action: the plan is always
 * RECOMPUTED from (stored normalisation + decisions) against live DB state —
 * deterministic, so what the review screens show is exactly what commit
 * applies, and a spec edited mid-review is re-diffed rather than clobbered.
 */

export function parseDecisions(session: ImportSessionRow): ImportDecisions {
  return importDecisionsSchema.parse(session.decisions ?? {});
}

export async function recomputePlan(
  supabase: SupabaseClient,
  workspaceId: WorkspaceId,
  session: ImportSessionRow,
  decisions: ImportDecisions,
): Promise<{ plan: ImportPlan; adjusted: NormalizedImport }> {
  const normalized = session.interpreted_structure!.normalized;
  const adjusted = applyDecisions(normalized, decisions);
  const current = await loadCurrentSpecState(supabase, {
    workspaceId,
    targetProductId: session.target_product_id,
    componentNames: adjusted.components.map((c) => c.name),
  });
  return { plan: reconcile(adjusted, current), adjusted };
}
