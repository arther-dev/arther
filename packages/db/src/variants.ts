import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveVariantSpec,
  slugifyVariantName,
  type DeltaType,
  type FieldType,
  type FieldValue,
  type ProductId,
  type ResolvedSpecEntry,
  type UserId,
  type VariantDeltaForResolution,
  type VariantDeltaId,
  type VariantDeltaInput,
  type VariantId,
  type VariantResolutionWarning,
  type WorkspaceId,
} from '@arther/types';
import { loadGenerationFields } from './generation-context';

/**
 * V.1 — the variant delta repository (Product Variants §3.2). Variants and their
 * deltas are member-read / editor-write (0010 RLS). A variant stores only a name +
 * an ordered delta list; its resolved spec is computed at query time (V.2), never
 * materialised. Thin typed calls over the user-JWT client (RLS active).
 */

export interface ProductVariantRow {
  id: VariantId;
  productId: ProductId;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VariantDeltaRow {
  id: VariantDeltaId;
  variantId: VariantId;
  deltaType: DeltaType;
  componentId: string | null;
  fieldId: string | null;
  overrideValue: unknown;
  replacementComponentId: string | null;
  newComponentId: string | null;
  positionAfter: string | null;
  createdAt: string;
}

const VARIANT_COLUMNS = 'id, product_id, name, slug, description, is_default, created_at, updated_at';

function toVariant(raw: Record<string, unknown>): ProductVariantRow {
  return {
    id: raw.id as VariantId,
    productId: raw.product_id as ProductId,
    name: raw.name as string,
    slug: raw.slug as string,
    description: (raw.description as string | null) ?? null,
    isDefault: Boolean(raw.is_default),
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

/** A product's variants, newest first. */
export async function listVariants(
  client: SupabaseClient,
  productId: ProductId,
): Promise<ProductVariantRow[]> {
  const { data, error } = await client
    .from('product_variants')
    .select(VARIANT_COLUMNS)
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listVariants: ${error.message}`);
  return (data ?? []).map((r) => toVariant(r as Record<string, unknown>));
}

/** One variant, or null. */
export async function getVariant(
  client: SupabaseClient,
  variantId: VariantId,
): Promise<ProductVariantRow | null> {
  const { data, error } = await client
    .from('product_variants')
    .select(VARIANT_COLUMNS)
    .eq('id', variantId)
    .maybeSingle();
  if (error) throw new Error(`getVariant: ${error.message}`);
  return data ? toVariant(data as Record<string, unknown>) : null;
}

/**
 * Create a variant on a product. The slug is derived from the name and made unique
 * within the product (the `(product_id, slug)` unique constraint) by suffixing.
 */
export async function createVariant(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    name: string;
    description?: string | null;
    userId: UserId;
  },
): Promise<VariantId> {
  const base = slugifyVariantName(input.name);
  const { data: existing, error: exErr } = await client
    .from('product_variants')
    .select('slug')
    .eq('product_id', input.productId);
  if (exErr) throw new Error(`createVariant.slugs: ${exErr.message}`);
  const taken = new Set((existing ?? []).map((r) => (r as { slug: string }).slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i += 1) slug = `${base}-${i}`;

  const { data, error } = await client
    .from('product_variants')
    .insert({
      workspace_id: input.workspaceId,
      product_id: input.productId,
      name: input.name,
      slug,
      description: input.description ?? null,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createVariant: ${error.message}`);
  return data.id as VariantId;
}

/** Rename a variant. */
export async function renameVariant(
  client: SupabaseClient,
  input: { variantId: VariantId; name: string; userId: UserId },
): Promise<void> {
  const { error } = await client
    .from('product_variants')
    .update({ name: input.name, updated_by: input.userId })
    .eq('id', input.variantId);
  if (error) throw new Error(`renameVariant: ${error.message}`);
}

/** Delete a variant (its deltas cascade away, 0010). */
export async function deleteVariant(client: SupabaseClient, variantId: VariantId): Promise<void> {
  const { error } = await client.from('product_variants').delete().eq('id', variantId);
  if (error) throw new Error(`deleteVariant: ${error.message}`);
}

/**
 * Make `variantId` the product's default (the base URL redirects to it). The
 * `product_variants_one_default_idx` partial unique index permits one default per
 * product, so the previous default is cleared first.
 */
export async function setVariantDefault(
  client: SupabaseClient,
  input: { productId: ProductId; variantId: VariantId; userId: UserId },
): Promise<void> {
  const { error: clearErr } = await client
    .from('product_variants')
    .update({ is_default: false, updated_by: input.userId })
    .eq('product_id', input.productId)
    .eq('is_default', true)
    .neq('id', input.variantId);
  if (clearErr) throw new Error(`setVariantDefault.clear: ${clearErr.message}`);
  const { error } = await client
    .from('product_variants')
    .update({ is_default: true, updated_by: input.userId })
    .eq('id', input.variantId);
  if (error) throw new Error(`setVariantDefault: ${error.message}`);
}

const DELTA_COLUMNS =
  'id, variant_id, delta_type, component_id, field_id, override_value, replacement_component_id, new_component_id, position_after, created_at';

function toDelta(raw: Record<string, unknown>): VariantDeltaRow {
  return {
    id: raw.id as VariantDeltaId,
    variantId: raw.variant_id as VariantId,
    deltaType: raw.delta_type as DeltaType,
    componentId: (raw.component_id as string | null) ?? null,
    fieldId: (raw.field_id as string | null) ?? null,
    overrideValue: raw.override_value ?? null,
    replacementComponentId: (raw.replacement_component_id as string | null) ?? null,
    newComponentId: (raw.new_component_id as string | null) ?? null,
    positionAfter: (raw.position_after as string | null) ?? null,
    createdAt: raw.created_at as string,
  };
}

/** A variant's deltas in application order (created_at ascending). */
export async function listVariantDeltas(
  client: SupabaseClient,
  variantId: VariantId,
): Promise<VariantDeltaRow[]> {
  const { data, error } = await client
    .from('variant_deltas')
    .select(DELTA_COLUMNS)
    .eq('variant_id', variantId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listVariantDeltas: ${error.message}`);
  return (data ?? []).map((r) => toDelta(r as Record<string, unknown>));
}

/** Map a typed delta input to the (sparse) `variant_deltas` columns it uses. */
function deltaColumns(input: VariantDeltaInput): Record<string, unknown> {
  switch (input.type) {
    case 'SCALAR_OVERRIDE':
      return {
        delta_type: input.type,
        component_id: input.componentId,
        field_id: input.fieldId,
        override_value: input.overrideValue,
      };
    case 'COMPONENT_SWAP':
      return {
        delta_type: input.type,
        component_id: input.componentId,
        replacement_component_id: input.replacementComponentId,
      };
    case 'COMPONENT_REMOVE':
      return { delta_type: input.type, component_id: input.componentId };
    case 'COMPONENT_ADD':
      return {
        delta_type: input.type,
        new_component_id: input.newComponentId,
        position_after: input.positionAfter ?? null,
      };
  }
}

/** Append a delta to a variant. Validation of the input shape is the caller's. */
export async function addVariantDelta(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; variantId: VariantId; delta: VariantDeltaInput; userId: UserId },
): Promise<VariantDeltaId> {
  const { data, error } = await client
    .from('variant_deltas')
    .insert({
      workspace_id: input.workspaceId,
      variant_id: input.variantId,
      ...deltaColumns(input.delta),
      created_by: input.userId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`addVariantDelta: ${error.message}`);
  return data.id as VariantDeltaId;
}

/** Remove a delta from a variant. */
export async function removeVariantDelta(
  client: SupabaseClient,
  deltaId: VariantDeltaId,
): Promise<void> {
  const { error } = await client.from('variant_deltas').delete().eq('id', deltaId);
  if (error) throw new Error(`removeVariantDelta: ${error.message}`);
}

export interface ResolvedVariantSpec {
  variant: ProductVariantRow;
  entries: ResolvedSpecEntry[];
  warnings: VariantResolutionWarning[];
}

/**
 * V.2 — compute a variant's resolved spec at query time (§3.3): the base product's
 * assembled spec with the variant's deltas applied in order. Pulls the field sets
 * for any component a SWAP/ADD introduces, then runs the pure engine. Returns null
 * if the variant doesn't exist. (Redis caching is a later optimisation — at query
 * time the result is always current by definition, so there is nothing to drift.)
 */
export async function loadResolvedVariantSpec(
  client: SupabaseClient,
  variantId: VariantId,
): Promise<ResolvedVariantSpec | null> {
  const variant = await getVariant(client, variantId);
  if (!variant) return null;

  const baseFields = await loadGenerationFields(client, variant.productId);
  const base: ResolvedSpecEntry[] = baseFields.map((f) => ({
    fieldId: f.id,
    name: f.name,
    category: f.category,
    type: f.type,
    value: f.value,
    unitId: f.unit_id,
    currentVersionId: f.current_version_id,
    owner: f.owner,
    componentId: f.component_id,
    componentName: f.component_name,
    origin: 'base',
    overridden: false,
  }));

  const deltas = await listVariantDeltas(client, variantId);

  // The components a SWAP/ADD introduces (their fields aren't in the base spec).
  const introduced = [
    ...new Set(
      deltas
        .flatMap((d) => [d.replacementComponentId, d.newComponentId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const componentFieldsById: Record<string, ResolvedSpecEntry[]> = {};
  const componentNamesById: Record<string, string> = {};
  if (introduced.length > 0) {
    const { data: comps, error: cErr } = await client
      .from('components')
      .select('id, name')
      .in('id', introduced);
    if (cErr) throw new Error(`loadResolvedVariantSpec.components: ${cErr.message}`);
    for (const c of comps ?? []) componentNamesById[(c as { id: string }).id] = (c as { name: string }).name;

    const { data: cf, error: cfErr } = await client
      .from('spec_fields')
      .select('id, name, category, type, value, unit_id, current_version_id, component_id')
      .in('component_id', introduced)
      .is('archived_at', null);
    if (cfErr) throw new Error(`loadResolvedVariantSpec.componentFields: ${cfErr.message}`);
    for (const row of cf ?? []) {
      const r = row as Record<string, unknown>;
      const cid = r.component_id as string;
      (componentFieldsById[cid] ??= []).push({
        fieldId: r.id as string,
        name: r.name as string,
        category: r.category as string,
        type: r.type as FieldType,
        value: (r.value as FieldValue | null) ?? null,
        unitId: (r.unit_id as string | null) ?? null,
        currentVersionId: (r.current_version_id as string | null) ?? null,
        owner: 'component',
        componentId: cid,
        componentName: componentNamesById[cid] ?? null,
        origin: 'base',
        overridden: false,
      });
    }
  }

  const forResolution: VariantDeltaForResolution[] = deltas.map((d) => ({
    type: d.deltaType,
    componentId: d.componentId,
    fieldId: d.fieldId,
    overrideValue: (d.overrideValue as FieldValue | null) ?? null,
    replacementComponentId: d.replacementComponentId,
    newComponentId: d.newComponentId,
  }));

  const { entries, warnings } = resolveVariantSpec({
    base,
    componentFieldsById,
    componentNamesById,
    deltas: forResolution,
  });
  return { variant, entries, warnings };
}
