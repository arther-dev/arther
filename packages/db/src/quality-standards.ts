import type { SupabaseClient } from '@supabase/supabase-js';
import type { QualityConstraint, QualityStandardId, UserId, WorkspaceId } from '@arther/types';

/**
 * G0.5 Document Quality Standards repository — thin, typed calls over the
 * user-JWT client (RLS active; the 0004 write policy is owner/admin, matching
 * canDo 'workspace.manage'). Quality Standards are a single-table Settings
 * surface with no default/archive lifecycle (unlike Brand Profiles): the table
 * has no `archived_at`, and "can't delete while referenced" is enforced by the
 * `document_types.quality_standard_id` foreign key (NO ACTION), surfaced here as
 * a typed `blocked: 'referenced'` rather than a raw FK error.
 */

export interface QualityStandardRow {
  id: QualityStandardId;
  name: string;
  constraints: QualityConstraint[];
  /** How many live Document Types are held to this standard (spec §3.5). */
  referenced_by: number;
}

export interface QualityStandardInput {
  name: string;
  constraints: QualityConstraint[];
}

const COLUMNS = 'id, name, constraints';

function toRow(raw: Record<string, unknown>, referencedBy: number): QualityStandardRow {
  return {
    id: raw.id as QualityStandardId,
    name: raw.name as string,
    constraints: (raw.constraints as QualityConstraint[]) ?? [],
    referenced_by: referencedBy,
  };
}

/** Map of quality_standard_id → number of live Document Types referencing it. */
async function referenceCounts(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<Map<string, number>> {
  const { data, error } = await client
    .from('document_types')
    .select('quality_standard_id')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .not('quality_standard_id', 'is', null);
  if (error) throw new Error(`referenceCounts: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = (row as { quality_standard_id: string }).quality_standard_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function listQualityStandards(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<QualityStandardRow[]> {
  const { data, error } = await client
    .from('document_quality_standards')
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('name');
  if (error) throw new Error(`listQualityStandards: ${error.message}`);

  const counts = await referenceCounts(client, workspaceId);
  return (data ?? []).map((raw) =>
    toRow(raw as Record<string, unknown>, counts.get((raw as { id: string }).id) ?? 0),
  );
}

export async function getQualityStandard(
  client: SupabaseClient,
  id: QualityStandardId,
): Promise<QualityStandardRow | null> {
  const { data, error } = await client
    .from('document_quality_standards')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getQualityStandard: ${error.message}`);
  return data ? toRow(data as Record<string, unknown>, 0) : null;
}

export async function createQualityStandard(
  client: SupabaseClient,
  input: QualityStandardInput & { workspaceId: WorkspaceId; createdBy: UserId },
): Promise<QualityStandardId> {
  const { data, error } = await client
    .from('document_quality_standards')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      constraints: input.constraints,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createQualityStandard: ${error.message}`);
  return data.id as QualityStandardId;
}

export async function updateQualityStandard(
  client: SupabaseClient,
  input: QualityStandardInput & { id: QualityStandardId; updatedBy: UserId },
): Promise<void> {
  const { error } = await client
    .from('document_quality_standards')
    .update({ name: input.name, constraints: input.constraints, updated_by: input.updatedBy })
    .eq('id', input.id);
  if (error) throw new Error(`updateQualityStandard: ${error.message}`);
}

/**
 * Hard-delete a standard. The `document_types.quality_standard_id` FK blocks the
 * delete while any Document Type references it (Postgres 23503); that's reported
 * as `blocked: 'referenced'` so the admin gets a clear message instead of a 500.
 */
export async function deleteQualityStandard(
  client: SupabaseClient,
  id: QualityStandardId,
): Promise<{ blocked?: 'referenced' }> {
  const { error } = await client.from('document_quality_standards').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return { blocked: 'referenced' };
    throw new Error(`deleteQualityStandard: ${error.message}`);
  }
  return {};
}
