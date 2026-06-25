'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import {
  addVariantDelta,
  createVariant,
  deleteVariant,
  getSpecField,
  getVariant,
  membershipLookupFor,
  getActiveWorkspace,
  removeVariantDelta,
  renameVariant,
  setVariantDefault,
  variantHasSnapshots,
} from '@arther/db';
import {
  createVariantSchema,
  isOverridableFieldType,
  productIdSchema,
  safeParseFieldValue,
  variantDeltaIdSchema,
  variantDeltaInputSchema,
  variantIdSchema,
  type ProductId,
  type SpecFieldId,
  type UserId,
  type VariantId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface VariantActionResult {
  ok: boolean;
  error?: string;
  variantId?: string;
}

/** The variant model is editor-level (owner/admin/member; viewers excluded). */
async function authorizeEdit() {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' as const };
  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: workspace.id }))) {
    return { error: 'Only editors can manage variants.' as const };
  }
  return { supabase, userId: user.id as UserId, workspace };
}

export async function createVariantAction(
  productId: string,
  name: string,
  description?: string,
): Promise<VariantActionResult> {
  const pid = productIdSchema.safeParse(productId);
  if (!pid.success) return { ok: false, error: 'Invalid product.' };
  const parsed = createVariantSchema.safeParse({ name, description });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const auth = await authorizeEdit();
  if ('error' in auth) return { ok: false, error: auth.error };

  let variantId: VariantId;
  try {
    variantId = await createVariant(auth.supabase, {
      workspaceId: auth.workspace.id,
      productId: pid.data,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      userId: auth.userId,
    });
  } catch {
    return { ok: false, error: 'Could not create the variant.' };
  }
  revalidatePath(`/specs/variants?product=${pid.data}`);
  return { ok: true, variantId };
}

export async function renameVariantAction(
  variantId: string,
  name: string,
): Promise<VariantActionResult> {
  const vid = variantIdSchema.safeParse(variantId);
  const parsed = createVariantSchema.shape.name.safeParse(name);
  if (!vid.success) return { ok: false, error: 'Invalid variant.' };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const auth = await authorizeEdit();
  if ('error' in auth) return { ok: false, error: auth.error };

  const variant = await getVariant(auth.supabase, vid.data);
  if (!variant) return { ok: false, error: 'Variant not found.' };
  try {
    await renameVariant(auth.supabase, { variantId: vid.data, name: parsed.data, userId: auth.userId });
  } catch {
    return { ok: false, error: 'Could not rename the variant.' };
  }
  revalidatePath(`/specs/variants?product=${variant.productId}`);
  return { ok: true };
}

export async function deleteVariantAction(variantId: string): Promise<VariantActionResult> {
  const vid = variantIdSchema.safeParse(variantId);
  if (!vid.success) return { ok: false, error: 'Invalid variant.' };

  const auth = await authorizeEdit();
  if ('error' in auth) return { ok: false, error: auth.error };

  const variant = await getVariant(auth.supabase, vid.data);
  if (!variant) return { ok: false, error: 'Variant not found.' };
  // V.9 — a variant that has ever published is permanent portal history (the
  // snapshots_variant_fk is ON DELETE RESTRICT). Refuse the delete with a clear
  // message rather than letting the FK raise. Its pages can be unpublished from
  // the document instead.
  if (await variantHasSnapshots(auth.supabase, vid.data)) {
    return {
      ok: false,
      error:
        'This variant has been published to the portal — its publication history is permanent, so it can’t be deleted. Unpublish its pages from the document instead.',
    };
  }
  try {
    await deleteVariant(auth.supabase, vid.data);
  } catch {
    return { ok: false, error: 'Could not delete the variant.' };
  }
  revalidatePath(`/specs/variants?product=${variant.productId}`);
  return { ok: true };
}

/**
 * V.3 — append a delta to a variant. The input shape is validated by
 * `variantDeltaInputSchema`; a SCALAR_OVERRIDE additionally re-checks that the
 * targeted field exists, is an overridable type, lives on the named component, and
 * that the override value parses against the field's declared type (the field type
 * isn't known to the pure schema). Editor-gated.
 */
export async function addVariantDeltaAction(
  variantId: string,
  delta: unknown,
): Promise<VariantActionResult> {
  const vid = variantIdSchema.safeParse(variantId);
  if (!vid.success) return { ok: false, error: 'Invalid variant.' };
  const parsed = variantDeltaInputSchema.safeParse(delta);
  if (!parsed.success) return { ok: false, error: 'That delta is incomplete or malformed.' };

  const auth = await authorizeEdit();
  if ('error' in auth) return { ok: false, error: auth.error };

  const variant = await getVariant(auth.supabase, vid.data);
  if (!variant) return { ok: false, error: 'Variant not found.' };

  if (parsed.data.type === 'SCALAR_OVERRIDE') {
    const field = await getSpecField(auth.supabase, parsed.data.fieldId as SpecFieldId);
    if (!field) return { ok: false, error: 'That field no longer exists.' };
    if (field.component_id !== parsed.data.componentId) {
      return { ok: false, error: 'That field is not on the named component.' };
    }
    if (!isOverridableFieldType(field.type)) {
      return { ok: false, error: `${field.type} fields can’t be overridden in a variant.` };
    }
    if (!safeParseFieldValue(field.type, parsed.data.overrideValue).success) {
      return { ok: false, error: 'The override value isn’t valid for this field’s type.' };
    }
  }

  try {
    await addVariantDelta(auth.supabase, {
      workspaceId: auth.workspace.id,
      variantId: vid.data,
      delta: parsed.data,
      userId: auth.userId,
    });
  } catch {
    return { ok: false, error: 'Could not add the delta.' };
  }
  revalidatePath(`/specs/variants/${vid.data}`);
  return { ok: true };
}

/** V.3 — remove a delta from a variant. Editor-gated. */
export async function removeVariantDeltaAction(
  variantId: string,
  deltaId: string,
): Promise<VariantActionResult> {
  const vid = variantIdSchema.safeParse(variantId);
  const did = variantDeltaIdSchema.safeParse(deltaId);
  if (!vid.success || !did.success) return { ok: false, error: 'Invalid reference.' };

  const auth = await authorizeEdit();
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await removeVariantDelta(auth.supabase, did.data);
  } catch {
    return { ok: false, error: 'Could not remove the delta.' };
  }
  revalidatePath(`/specs/variants/${vid.data}`);
  return { ok: true };
}

export async function setVariantDefaultAction(variantId: string): Promise<VariantActionResult> {
  const vid = variantIdSchema.safeParse(variantId);
  if (!vid.success) return { ok: false, error: 'Invalid variant.' };

  const auth = await authorizeEdit();
  if ('error' in auth) return { ok: false, error: auth.error };

  const variant = await getVariant(auth.supabase, vid.data);
  if (!variant) return { ok: false, error: 'Variant not found.' };
  try {
    await setVariantDefault(auth.supabase, {
      productId: variant.productId as ProductId,
      variantId: vid.data,
      userId: auth.userId,
    });
  } catch {
    return { ok: false, error: 'Could not set the default variant.' };
  }
  revalidatePath(`/specs/variants?product=${variant.productId}`);
  return { ok: true };
}
