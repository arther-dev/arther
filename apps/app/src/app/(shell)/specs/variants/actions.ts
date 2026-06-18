'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import {
  createVariant,
  deleteVariant,
  getVariant,
  membershipLookupFor,
  getActiveWorkspace,
  renameVariant,
  setVariantDefault,
} from '@arther/db';
import {
  createVariantSchema,
  productIdSchema,
  variantIdSchema,
  type ProductId,
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
  try {
    await deleteVariant(auth.supabase, vid.data);
  } catch {
    return { ok: false, error: 'Could not delete the variant.' };
  }
  revalidatePath(`/specs/variants?product=${variant.productId}`);
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
