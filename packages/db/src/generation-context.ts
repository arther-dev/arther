import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ComponentId,
  FieldType,
  FieldValue,
  FieldVersionId,
  ProductId,
  SpecFieldId,
  UnitId,
} from '@arther/types';

/**
 * G2.2 wiring — the spec graph a generation run draws on: every live field of
 * the product and its attached components, with the current version pointer +
 * typed value + unit needed to (a) build the `FieldResolver` (field_id → current
 * version + formatted display) and (b) list citable fields in each section's
 * prompt. Over the user-JWT client (RLS).
 */
export interface GenerationFieldRow {
  id: SpecFieldId;
  name: string;
  category: string;
  type: FieldType;
  value: FieldValue | null;
  unit_id: UnitId | null;
  current_version_id: FieldVersionId | null;
  owner: 'product' | 'component';
  component_id: ComponentId | null;
  component_name: string | null;
}

const COLUMNS = 'id, name, category, type, value, unit_id, current_version_id';

export async function loadGenerationFields(
  client: SupabaseClient,
  productId: ProductId,
): Promise<GenerationFieldRow[]> {
  const product = await client
    .from('spec_fields')
    .select(COLUMNS)
    .eq('product_id', productId)
    .is('archived_at', null);
  if (product.error) throw new Error(`loadGenerationFields.product: ${product.error.message}`);

  const fields: GenerationFieldRow[] = (product.data ?? []).map((row): GenerationFieldRow => ({
    id: row.id as SpecFieldId,
    name: row.name as string,
    category: row.category as string,
    type: row.type as FieldType,
    value: (row.value as FieldValue | null) ?? null,
    unit_id: (row.unit_id as UnitId | null) ?? null,
    current_version_id: (row.current_version_id as FieldVersionId | null) ?? null,
    owner: 'product',
    component_id: null,
    component_name: null,
  }));

  const edges = await client
    .from('product_components')
    .select('component_id, components!inner(name)')
    .eq('product_id', productId);
  if (edges.error) throw new Error(`loadGenerationFields.edges: ${edges.error.message}`);

  const nameById = new Map<string, string>();
  for (const edge of edges.data ?? []) {
    const component = Array.isArray(edge.components) ? edge.components[0] : edge.components;
    if (component) nameById.set(edge.component_id as string, (component as { name: string }).name);
  }
  const componentIds = [...nameById.keys()];
  if (componentIds.length === 0) return fields;

  const componentFields = await client
    .from('spec_fields')
    .select(`${COLUMNS}, component_id`)
    .in('component_id', componentIds)
    .is('archived_at', null);
  if (componentFields.error)
    throw new Error(`loadGenerationFields.componentFields: ${componentFields.error.message}`);

  for (const row of componentFields.data ?? []) {
    fields.push({
      id: row.id as SpecFieldId,
      name: row.name as string,
      category: row.category as string,
      type: row.type as FieldType,
      value: (row.value as FieldValue | null) ?? null,
      unit_id: (row.unit_id as UnitId | null) ?? null,
      current_version_id: (row.current_version_id as FieldVersionId | null) ?? null,
      owner: 'component',
      component_id: row.component_id as ComponentId,
      component_name: nameById.get(row.component_id as string) ?? null,
    });
  }
  return fields;
}
