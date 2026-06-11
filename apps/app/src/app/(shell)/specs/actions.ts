'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import {
  createProduct,
  createSpecField,
  getActiveWorkspace,
  membershipLookupFor,
  updateFieldValue,
} from '@arther/db';
import {
  fieldTypeSchema,
  type ProductId,
  type SpecFieldId,
  type UnitId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../lib/supabase/server';

export interface SpecsFormState {
  error?: string;
}

/**
 * Every mutation routes through canDo (guardrail 1) with RLS behind it
 * (defence in depth) — the single-call-site rule the F3 acceptance greps for.
 */
async function authorize() {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' as const };

  const canDo = createCanDo(membershipLookupFor(supabase));
  const allowed = await canDo({ id: user.id as UserId }, 'spec.write', {
    workspaceId: workspace.id,
  });
  if (!allowed) return { error: 'Viewers can’t edit specs — ask for an Editor seat.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

const productSchema = z.object({ name: z.string().trim().min(1, 'Name the product.') });

export async function createProductAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  const productId = await createProduct(auth.supabase, {
    workspaceId: auth.workspace.id,
    name: parsed.data.name,
    createdBy: auth.userId,
  });
  revalidatePath('/specs');
  redirect(`/specs?product=${productId}`);
}

const fieldSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name the field.'),
  type: fieldTypeSchema,
  category: z.string().trim().min(1),
  unitId: z.string().uuid().optional().or(z.literal('')),
});

export async function createFieldAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = fieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  await createSpecField(auth.supabase, {
    workspaceId: auth.workspace.id,
    productId: parsed.data.productId as ProductId,
    name: parsed.data.name,
    type: parsed.data.type,
    category: parsed.data.category,
    unitId: parsed.data.unitId ? (parsed.data.unitId as UnitId) : undefined,
    createdBy: auth.userId,
  });
  revalidatePath('/specs');
  return {};
}

const scalarValueSchema = z.object({
  fieldId: z.string().uuid(),
  unitId: z.string().uuid({ message: 'Pick a unit.' }),
  value: z.coerce.number({ message: 'Enter a number.' }).finite(),
  note: z.string().trim().optional(),
});

export async function updateScalarValueAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = scalarValueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  await updateFieldValue(auth.supabase, {
    fieldId: parsed.data.fieldId as SpecFieldId,
    type: 'scalar',
    value: { value: parsed.data.value, unit_id: parsed.data.unitId },
    note: parsed.data.note || undefined,
  });
  revalidatePath('/specs');
  return {};
}
