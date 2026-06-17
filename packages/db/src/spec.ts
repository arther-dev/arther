import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcError } from './errors';
import {
  isOverridableFieldType,
  moveInList,
  parseFieldValue,
  type ComponentId,
  type FieldType,
  type FieldValue,
  type ProductId,
  type ReferenceEdge,
  type ReleaseId,
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
  logoUrl: string | null;
}

/** v1 is single-workspace (multi-workspace deferred): first membership wins. */
export async function getActiveWorkspace(client: SupabaseClient): Promise<ActiveWorkspace | null> {
  const { data, error } = await client
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, slug, logo_url)')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const ws = data.workspaces as unknown as {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
  return {
    id: ws.id as WorkspaceId,
    name: ws.name,
    slug: ws.slug,
    role: data.role as WorkspaceRole,
    logoUrl: ws.logo_url ?? null,
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
  /** Exactly one owner is set (0003 XOR check). */
  component_id: ComponentId | null;
  product_id: ProductId | null;
  name: string;
  type: FieldType;
  value: FieldValue | null;
  unit_id: UnitId | null;
  /** Field-level option list for enum/multi_enum (spec §4.6: options belong to the field). */
  options: string[] | null;
  category: string;
  source: 'rated' | 'typical' | 'measured' | 'calculated';
  conditions: string | null;
  display_order: number;
  archived_at: string | null;
}

const FIELD_COLUMNS =
  'id, workspace_id, component_id, product_id, name, type, value, unit_id, options, category, source, conditions, display_order, archived_at';

export async function listFieldsForProduct(
  client: SupabaseClient,
  productId: ProductId,
): Promise<SpecFieldRow[]> {
  const { data, error } = await client
    .from('spec_fields')
    .select(FIELD_COLUMNS)
    .eq('product_id', productId)
    .is('archived_at', null)
    .order('category')
    .order('display_order');
  if (error) throw new Error(`listFieldsForProduct: ${error.message}`);
  return (data ?? []) as SpecFieldRow[];
}

export async function listFieldsForComponents(
  client: SupabaseClient,
  componentIds: ComponentId[],
): Promise<Map<ComponentId, SpecFieldRow[]>> {
  const result = new Map<ComponentId, SpecFieldRow[]>();
  if (componentIds.length === 0) return result;
  const { data, error } = await client
    .from('spec_fields')
    .select(FIELD_COLUMNS)
    .in('component_id', componentIds)
    .is('archived_at', null)
    .order('category')
    .order('display_order');
  if (error) throw new Error(`listFieldsForComponents: ${error.message}`);
  for (const row of (data ?? []) as Array<SpecFieldRow & { component_id: ComponentId }>) {
    const list = result.get(row.component_id) ?? [];
    list.push(row);
    result.set(row.component_id, list);
  }
  return result;
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
    /** Exactly one owner (0003 XOR check): product or component. */
    productId?: ProductId;
    componentId?: ComponentId;
    name: string;
    type: FieldType;
    category: string;
    unitId?: UnitId;
    /** Required for enum/multi_enum (spec §4.6). */
    options?: string[];
    createdBy: UserId;
    /** Optional initial value — validated, then versioned via the RPC. */
    value?: unknown;
  },
): Promise<SpecFieldId> {
  const { data, error } = await client
    .from('spec_fields')
    .insert({
      workspace_id: input.workspaceId,
      product_id: input.productId ?? null,
      component_id: input.componentId ?? null,
      name: input.name,
      type: input.type,
      category: input.category,
      unit_id: input.unitId ?? null,
      options: input.options ?? null,
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

export interface ComponentRow {
  id: ComponentId;
  workspace_id: WorkspaceId;
  name: string;
  type: 'assembly' | 'module' | 'part';
  description: string | null;
  archived_at: string | null;
  /** Graph fan-out: how many products use this component ("used in N products"). */
  usage_count: number;
}

export async function listComponents(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<ComponentRow[]> {
  const { data, error } = await client
    .from('components')
    .select('id, workspace_id, name, type, description, archived_at, product_components(count)')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('name');
  if (error) throw new Error(`listComponents: ${error.message}`);
  return (data ?? []).map((row) => {
    const { product_components, ...rest } = row as ComponentRow & {
      product_components: Array<{ count: number }>;
    };
    return { ...rest, usage_count: product_components?.[0]?.count ?? 0 };
  });
}

export async function createComponent(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    name: string;
    type?: 'assembly' | 'module' | 'part';
    createdBy: UserId;
  },
): Promise<ComponentId> {
  const { data, error } = await client
    .from('components')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      type: input.type ?? 'part',
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createComponent: ${error.message}`);
  return data.id as ComponentId;
}

export interface ProductComponentEdge {
  id: string;
  component_id: ComponentId;
  component_name: string;
  /** Nesting WITHIN this product's tree — references another edge (0003). */
  parent_component_id: string | null;
  quantity: number;
  /** Across the whole workspace — drives the shared-component badge. */
  usage_count: number;
}

/** The graph, not a tree (invariant 3): edges from one product to its components. */
export async function listProductComponents(
  client: SupabaseClient,
  productId: ProductId,
): Promise<ProductComponentEdge[]> {
  const { data, error } = await client
    .from('product_components')
    .select(
      'id, component_id, parent_component_id, quantity, components!inner(name, product_components(count))',
    )
    .eq('product_id', productId)
    .order('display_order');
  if (error) throw new Error(`listProductComponents: ${error.message}`);
  return (data ?? []).map((row) => {
    const c = (row as Record<string, unknown>).components as {
      name: string;
      product_components: Array<{ count: number }>;
    };
    return {
      id: (row as { id: string }).id,
      component_id: (row as { component_id: string }).component_id as ComponentId,
      component_name: c.name,
      parent_component_id: (row as { parent_component_id: string | null }).parent_component_id,
      quantity: (row as { quantity: number }).quantity,
      usage_count: c.product_components?.[0]?.count ?? 0,
    };
  });
}

export async function addComponentToProduct(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    componentId: ComponentId;
    /** Nest under an existing edge of the same product (F5.3/F6.2 tree). */
    parentEdgeId?: string;
    quantity?: number;
    createdBy: UserId;
  },
): Promise<void> {
  const { error } = await client.from('product_components').insert({
    workspace_id: input.workspaceId,
    product_id: input.productId,
    component_id: input.componentId,
    parent_component_id: input.parentEdgeId ?? null,
    quantity: input.quantity ?? 1,
    created_by: input.createdBy,
  });
  if (error) throw new Error(`addComponentToProduct: ${error.message}`);
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

export interface ReleaseRow {
  id: ReleaseId;
  product_id: ProductId;
  name: string;
  tag: string;
  notes: string | null;
  created_by: UserId | null;
  created_at: string;
  /** How many field versions this release pins. */
  pinned_count: number;
}

export async function listReleasesForProduct(
  client: SupabaseClient,
  productId: ProductId,
): Promise<ReleaseRow[]> {
  const { data, error } = await client
    .from('product_releases')
    .select('id, product_id, name, tag, notes, created_by, created_at, release_field_values(count)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listReleasesForProduct: ${error.message}`);
  return (data ?? []).map((row) => {
    const { release_field_values, ...rest } = row as ReleaseRow & {
      release_field_values: Array<{ count: number }>;
    };
    return { ...rest, pinned_count: release_field_values?.[0]?.count ?? 0 };
  });
}

/** Workspace-wide list for the Releases rail view, newest first. */
export async function listReleases(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<Array<ReleaseRow & { product_name: string }>> {
  const { data, error } = await client
    .from('product_releases')
    .select(
      'id, product_id, name, tag, notes, created_by, created_at, products!inner(name), release_field_values(count)',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listReleases: ${error.message}`);
  return (data ?? []).map((row) => {
    const { products, release_field_values, ...rest } = row as unknown as ReleaseRow & {
      products: { name: string };
      release_field_values: Array<{ count: number }>;
    };
    return {
      ...rest,
      product_name: products.name,
      pinned_count: release_field_values?.[0]?.count ?? 0,
    };
  });
}

/**
 * Named snapshot pinning the current FieldVersion of every valued field on
 * the product + its attached components — atomic via the 0013 RPC (invoker
 * rights, RLS active). Never automatic: explicit user action only (§3.8).
 */
export async function createRelease(
  client: SupabaseClient,
  input: { productId: ProductId; name: string; tag: string; notes?: string },
): Promise<ReleaseId> {
  const { data, error } = await client.rpc('create_product_release', {
    p_product_id: input.productId,
    p_name: input.name,
    p_tag: input.tag,
    p_notes: input.notes ?? null,
  });
  if (error) throw rpcError('createRelease', error);
  return data as ReleaseId;
}

/**
 * Deletion is permitted while no document references the release; the 0013
 * guard raises otherwise (§3.8). The confirmation step lives in the UI.
 */
export async function deleteRelease(client: SupabaseClient, releaseId: ReleaseId): Promise<void> {
  const { error } = await client.from('product_releases').delete().eq('id', releaseId);
  if (error) throw rpcError('deleteRelease', error);
}

export interface OverrideRow {
  product_component_id: string;
  field_id: SpecFieldId;
  value: FieldValue;
  set_by: UserId | null;
  set_at: string;
}

/** All overrides held by one product's edges, keyed `${edgeId}:${fieldId}`. */
export async function listOverridesForProduct(
  client: SupabaseClient,
  productId: ProductId,
): Promise<Map<string, OverrideRow>> {
  const { data, error } = await client
    .from('product_component_overrides')
    .select('product_component_id, field_id, value, set_by, set_at, product_components!inner(product_id)')
    .eq('product_components.product_id', productId);
  if (error) throw new Error(`listOverridesForProduct: ${error.message}`);
  const map = new Map<string, OverrideRow>();
  for (const row of (data ?? []) as unknown as OverrideRow[]) {
    map.set(`${row.product_component_id}:${row.field_id}`, row);
  }
  return map;
}

/**
 * Set (or replace) a product-specific override on a shared component field.
 * Scalar family only (§3.5) — gated here AND by the 0013 integrity trigger.
 * `set_by` routes review notifications when the underlying field changes.
 */
export async function setComponentOverride(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    productComponentId: string;
    fieldId: SpecFieldId;
    type: FieldType;
    value: unknown;
    setBy: UserId;
  },
): Promise<void> {
  if (!isOverridableFieldType(input.type)) {
    throw new Error(`setComponentOverride: ${input.type} fields cannot be overridden`);
  }
  const parsed = parseFieldValue(input.type, input.value);
  const { error } = await client.from('product_component_overrides').upsert(
    {
      workspace_id: input.workspaceId,
      product_component_id: input.productComponentId,
      field_id: input.fieldId,
      value: parsed,
      set_by: input.setBy,
      set_at: new Date().toISOString(),
    },
    { onConflict: 'product_component_id,field_id' },
  );
  if (error) throw new Error(`setComponentOverride: ${error.message}`);
}

/** Remove an override — the field falls back to the component's global value. */
export async function clearComponentOverride(
  client: SupabaseClient,
  input: { productComponentId: string; fieldId: SpecFieldId },
): Promise<void> {
  const { error } = await client
    .from('product_component_overrides')
    .delete()
    .eq('product_component_id', input.productComponentId)
    .eq('field_id', input.fieldId);
  if (error) throw new Error(`clearComponentOverride: ${error.message}`);
}

export interface FieldCommentRow {
  id: string;
  field_id: SpecFieldId;
  /** Version current when the comment was made — the "at this comment" marker. */
  field_version_id: string | null;
  value_snapshot: FieldValue | null;
  author_id: UserId | null;
  body: string;
  parent_comment_id: string | null;
  created_at: string;
  edited_at: string | null;
}

export async function listFieldComments(
  client: SupabaseClient,
  fieldId: SpecFieldId,
): Promise<FieldCommentRow[]> {
  const { data, error } = await client
    .from('field_comments')
    .select(
      'id, field_id, field_version_id, value_snapshot, author_id, body, parent_comment_id, created_at, edited_at',
    )
    .eq('field_id', fieldId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listFieldComments: ${error.message}`);
  return (data ?? []) as FieldCommentRow[];
}

/**
 * F5.8: the version context (current version + value snapshot) is captured
 * server-side at insert so "at this comment" can never drift from what the
 * author was looking at. Commenting is a viewer right (canDo 'comment.write';
 * the 0003 policy is member-wide, not editor-gated).
 */
export async function addFieldComment(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    fieldId: SpecFieldId;
    body: string;
    authorId: UserId;
    parentCommentId?: string;
  },
): Promise<void> {
  const { data: field, error: fieldError } = await client
    .from('spec_fields')
    .select('current_version_id, value')
    .eq('id', input.fieldId)
    .single();
  if (fieldError || !field) throw new Error(`addFieldComment: field not found`);
  const { error } = await client.from('field_comments').insert({
    workspace_id: input.workspaceId,
    field_id: input.fieldId,
    field_version_id: field.current_version_id,
    value_snapshot: field.value,
    author_id: input.authorId,
    body: input.body,
    parent_comment_id: input.parentCommentId ?? null,
  });
  if (error) throw new Error(`addFieldComment: ${error.message}`);
}

/** One field with owner + archive state — the detail panel's subject. */
export async function getSpecField(
  client: SupabaseClient,
  fieldId: SpecFieldId,
): Promise<SpecFieldRow | null> {
  const { data, error } = await client
    .from('spec_fields')
    .select(FIELD_COLUMNS)
    .eq('id', fieldId)
    .maybeSingle();
  if (error) throw new Error(`getSpecField: ${error.message}`);
  return (data as SpecFieldRow | null) ?? null;
}

/**
 * F6 — move a spec field one step within its (owner + category) group. Reorder
 * is within a category because the grid orders by `category` then
 * `display_order`. Loads the field's non-archived same-category siblings in
 * order, swaps the field one step (a boundary move is a no-op), then reindexes
 * the whole group so `display_order` stays total + gap-free. RLS-gated (editor
 * write on `spec_fields`).
 */
export async function moveSpecFieldOrder(
  client: SupabaseClient,
  input: { fieldId: SpecFieldId; direction: -1 | 1; userId: UserId },
): Promise<void> {
  const { data: field, error } = await client
    .from('spec_fields')
    .select('id, category, product_id, component_id')
    .eq('id', input.fieldId)
    .maybeSingle();
  if (error) throw new Error(`moveSpecFieldOrder: ${error.message}`);
  if (!field) throw new Error('moveSpecFieldOrder: field not found');

  let query = client
    .from('spec_fields')
    .select('id')
    .eq('category', field.category as string)
    .is('archived_at', null)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });
  query = field.product_id
    ? query.eq('product_id', field.product_id as string)
    : query.eq('component_id', field.component_id as string);
  const { data: siblings, error: sibErr } = await query;
  if (sibErr) throw new Error(`moveSpecFieldOrder(siblings): ${sibErr.message}`);

  const ids = (siblings ?? []).map((s) => s.id as string);
  const idx = ids.indexOf(input.fieldId);
  if (idx < 0) return;
  const reordered = moveInList(ids, idx, input.direction);
  if (reordered[idx] === ids[idx]) return; // boundary — nothing moved

  for (let i = 0; i < reordered.length; i += 1) {
    const { error: upErr } = await client
      .from('spec_fields')
      .update({ display_order: i, updated_by: input.userId })
      .eq('id', reordered[i]!);
    if (upErr) throw new Error(`moveSpecFieldOrder(update): ${upErr.message}`);
  }
}

/** Display names for feed attribution (id → name/email). */
export async function listUsersByIds(
  client: SupabaseClient,
  ids: UserId[],
): Promise<Map<UserId, { name: string | null; email: string }>> {
  const map = new Map<UserId, { name: string | null; email: string }>();
  if (ids.length === 0) return map;
  const { data, error } = await client
    .from('users')
    .select('id, name, email')
    .in('id', [...new Set(ids)]);
  if (error) throw new Error(`listUsersByIds: ${error.message}`);
  for (const row of data ?? []) {
    map.set(row.id as UserId, { name: row.name as string | null, email: row.email as string });
  }
  return map;
}

/**
 * F5.10 archive lifecycle — soft archive/restore on every spec entity. Hard
 * delete stays DB-guarded (zero-reference rule, invariant 7) and has no UI.
 */
export async function setArchived(
  client: SupabaseClient,
  input: {
    entity: 'products' | 'components' | 'spec_fields';
    id: string;
    archived: boolean;
    userId: UserId;
  },
): Promise<void> {
  const { error } = await client
    .from(input.entity)
    .update({
      archived_at: input.archived ? new Date().toISOString() : null,
      archived_by: input.archived ? input.userId : null,
      updated_by: input.userId,
    })
    .eq('id', input.id);
  if (error) throw new Error(`setArchived(${input.entity}): ${error.message}`);
}

export interface ArchivedRow {
  id: string;
  name: string;
  archived_at: string;
}

/** Archived items for the restore disclosures (F5.10). */
export async function listArchived(
  client: SupabaseClient,
  entity: 'products' | 'components',
  workspaceId: WorkspaceId,
): Promise<ArchivedRow[]> {
  const { data, error } = await client
    .from(entity)
    .select('id, name, archived_at')
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (error) throw new Error(`listArchived(${entity}): ${error.message}`);
  return (data ?? []) as ArchivedRow[];
}

export async function listArchivedFields(
  client: SupabaseClient,
  owner: { productId?: ProductId; componentIds?: ComponentId[] },
): Promise<Array<ArchivedRow & { component_id: ComponentId | null }>> {
  if (!owner.productId && (owner.componentIds?.length ?? 0) === 0) return [];
  let query = client
    .from('spec_fields')
    .select('id, name, archived_at, component_id')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (owner.productId) query = query.eq('product_id', owner.productId);
  if (owner.componentIds?.length) query = query.in('component_id', owner.componentIds);
  const { data, error } = await query;
  if (error) throw new Error(`listArchivedFields: ${error.message}`);
  return (data ?? []) as Array<ArchivedRow & { component_id: ComponentId | null }>;
}

/**
 * The workspace's reference-field graph (F5.9): one edge per component-owned
 * reference field that has a value. Product-owned reference fields cannot
 * close a cycle (products are never reference targets) and are excluded.
 * `field_id` lets the caller drop the edge being re-pointed before checking.
 */
export async function listReferenceEdges(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<Array<ReferenceEdge & { field_id: SpecFieldId }>> {
  const { data, error } = await client
    .from('spec_fields')
    .select('id, component_id, value')
    .eq('workspace_id', workspaceId)
    .eq('type', 'reference')
    .not('component_id', 'is', null)
    .not('value', 'is', null)
    .is('archived_at', null);
  if (error) throw new Error(`listReferenceEdges: ${error.message}`);
  return (data ?? []).map((row) => ({
    field_id: row.id as SpecFieldId,
    from: row.component_id as string,
    to: (row.value as { component_id: string }).component_id,
  }));
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
