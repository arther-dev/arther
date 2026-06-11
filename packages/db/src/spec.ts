import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseFieldValue,
  type FieldType,
  type FieldValue,
  type ProductId,
  type SpecFieldId,
  type UnitId,
  type UserId,
  type WorkspaceId,
  type WorkspaceRole,
} from '@arther/types';

/**
 * Spec-domain repository (F5): thin, typed reads/mutations over the user-JWT
 * client — RLS is active on every call (ADR-010). Field values are validated
 * against the FieldValue union BEFORE any write (the one-schema rule,
 * ADR-012); value changes go through the atomic update_spec_field_value RPC
 * (migration 0012) so the version history can never drift from the value.
 */

export interface ActiveWorkspace {
  id: WorkspaceId;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

/** v1 is single-workspace (multi-workspace deferred): first membership wins. */
export async function getActiveWorkspace(client: SupabaseClient): Promise<ActiveWorkspace | null> {
  const { data, error } = await client
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, slug)')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const ws = data.workspaces as unknown as { id: string; name: string; slug: string };
  return {
    id: ws.id as WorkspaceId,
    name: ws.name,
    slug: ws.slug,
    role: data.role as WorkspaceRole,
  };
}

export interface ProductRow {
  id: ProductId;
  workspace_id: WorkspaceId;
  name: string;
  description: string | null;
  archived_at: string | null;
}

export async function listProducts(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<ProductRow[]> {
  const { data, error } = await client
    .from('products')
    .select('id, workspace_id, name, description, archived_at')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('name');
  if (error) throw new Error(`listProducts: ${error.message}`);
  return (data ?? []) as ProductRow[];
}

export async function createProduct(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; name: string; createdBy: UserId },
): Promise<ProductId> {
  const { data, error } = await client
    .from('products')
    .insert({ workspace_id: input.workspaceId, name: input.name, created_by: input.createdBy })
    .select('id')
    .single();
  if (error) throw new Error(`createProduct: ${error.message}`);
  return data.id as ProductId;
}

export interface SpecFieldRow {
  id: SpecFieldId;
  workspace_id: WorkspaceId;
  name: string;
  type: FieldType;
  value: FieldValue | null;
  unit_id: UnitId | null;
  category: string;
  source: 'rated' | 'typical' | 'measured' | 'calculated';
  conditions: string | null;
  display_order: number;
  archived_at: string | null;
}

export async function listFieldsForProduct(
  client: SupabaseClient,
  productId: ProductId,
): Promise<SpecFieldRow[]> {
  const { data, error } = await client
    .from('spec_fields')
    .select(
      'id, workspace_id, name, type, value, unit_id, category, source, conditions, display_order, archived_at',
    )
    .eq('product_id', productId)
    .is('archived_at', null)
    .order('category')
    .order('display_order');
  if (error) throw new Error(`listFieldsForProduct: ${error.message}`);
  return (data ?? []) as SpecFieldRow[];
}

export interface UnitRow {
  id: UnitId;
  name: string;
  symbol: string;
  dimension: string;
}

/** Global built-ins (workspace_id null) + the workspace's custom units. */
export async function listUnits(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<UnitRow[]> {
  const { data, error } = await client
    .from('units')
    .select('id, name, symbol, dimension')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('dimension')
    .order('name');
  if (error) throw new Error(`listUnits: ${error.message}`);
  return (data ?? []) as UnitRow[];
}

export async function createSpecField(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    name: string;
    type: FieldType;
    category: string;
    unitId?: UnitId;
    createdBy: UserId;
    /** Optional initial value — validated, then versioned via the RPC. */
    value?: unknown;
  },
): Promise<SpecFieldId> {
  const { data, error } = await client
    .from('spec_fields')
    .insert({
      workspace_id: input.workspaceId,
      product_id: input.productId,
      name: input.name,
      type: input.type,
      category: input.category,
      unit_id: input.unitId ?? null,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createSpecField: ${error.message}`);
  const fieldId = data.id as SpecFieldId;
  if (input.value !== undefined && input.value !== null) {
    await updateFieldValue(client, {
      fieldId,
      type: input.type,
      value: input.value,
      note: 'Initial value',
    });
  }
  return fieldId;
}

export async function updateFieldValue(
  client: SupabaseClient,
  input: { fieldId: SpecFieldId; type: FieldType; value: unknown; note?: string },
): Promise<void> {
  // Zod gate before any write: an invalid shape never reaches the database.
  const parsed = parseFieldValue(input.type, input.value);
  const { error } = await client.rpc('update_spec_field_value', {
    p_field_id: input.fieldId,
    p_value: parsed,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(`updateFieldValue: ${error.message}`);
}

export interface FieldVersionRow {
  id: string;
  value: FieldValue | null;
  note: string | null;
  changed_by: UserId | null;
  changed_at: string;
}

export async function listFieldVersions(
  client: SupabaseClient,
  fieldId: SpecFieldId,
): Promise<FieldVersionRow[]> {
  const { data, error } = await client
    .from('field_versions')
    .select('id, value, note, changed_by, changed_at')
    .eq('field_id', fieldId)
    .order('changed_at', { ascending: false });
  if (error) throw new Error(`listFieldVersions: ${error.message}`);
  return (data ?? []) as FieldVersionRow[];
}

/** Membership lookup for canDo (@arther/authz) over the user-JWT client. */
export function membershipLookupFor(client: SupabaseClient) {
  return async (userId: UserId, workspaceId: WorkspaceId) => {
    const { data } = await client
      .from('workspace_members')
      .select('role')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    return data ? { role: data.role as WorkspaceRole } : null;
  };
}
