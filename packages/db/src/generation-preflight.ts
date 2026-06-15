import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreflightField, ProductId } from '@arther/types';

/**
 * G2.1 — assemble the pre-flight field list for a product: its own spec fields
 * plus the fields of every attached component, each reduced to what the
 * readiness report needs (category, populated, required, owner). Over the
 * user-JWT client, so RLS scopes it to the caller's workspace. `populated` is
 * `value is not null` — the spec convention for "entered" (0003).
 */
export async function listPreflightFields(
  client: SupabaseClient,
  productId: ProductId,
): Promise<PreflightField[]> {
  const product = await client
    .from('spec_fields')
    .select('name, category, value, required')
    .eq('product_id', productId)
    .is('archived_at', null);
  if (product.error) throw new Error(`listPreflightFields.product: ${product.error.message}`);

  const fields: PreflightField[] = (product.data ?? []).map((row): PreflightField => ({
    name: row.name as string,
    category: row.category as string,
    required: Boolean(row.required),
    populated: row.value !== null,
    owner: 'product',
  }));

  const edges = await client
    .from('product_components')
    .select('component_id, components!inner(name)')
    .eq('product_id', productId);
  if (edges.error) throw new Error(`listPreflightFields.edges: ${edges.error.message}`);

  const nameById = new Map<string, string>();
  for (const edge of edges.data ?? []) {
    const component = Array.isArray(edge.components) ? edge.components[0] : edge.components;
    if (component) nameById.set(edge.component_id as string, (component as { name: string }).name);
  }
  const componentIds = [...nameById.keys()];
  if (componentIds.length === 0) return fields;

  const componentFields = await client
    .from('spec_fields')
    .select('name, category, value, required, component_id')
    .in('component_id', componentIds)
    .is('archived_at', null);
  if (componentFields.error)
    throw new Error(`listPreflightFields.componentFields: ${componentFields.error.message}`);

  for (const row of componentFields.data ?? []) {
    fields.push({
      name: row.name as string,
      category: row.category as string,
      required: Boolean(row.required),
      populated: row.value !== null,
      owner: 'component',
      componentName: nameById.get(row.component_id as string),
    });
  }
  return fields;
}
