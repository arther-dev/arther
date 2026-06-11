'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import {
  addComponentToProduct,
  createComponent,
  createProduct,
  createSpecField,
  getActiveWorkspace,
  membershipLookupFor,
  updateFieldValue,
} from '@arther/db';
import {
  fieldTypeSchema,
  type ComponentId,
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

const fieldSchema = z
  .object({
    ownerKind: z.enum(['product', 'component']),
    ownerId: z.string().uuid(),
    name: z.string().trim().min(1, 'Name the field.'),
    type: fieldTypeSchema,
    category: z.string().trim().min(1),
    unitId: z.string().uuid().optional().or(z.literal('')),
    options: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.type === 'enum' || v.type === 'multi_enum') && !parseOptions(v.options).length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'List the options, comma-separated.',
      });
    }
  });

/** Options are defined at field creation and belong to the field (spec §4.6). */
function parseOptions(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
}

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
    productId:
      parsed.data.ownerKind === 'product' ? (parsed.data.ownerId as ProductId) : undefined,
    componentId:
      parsed.data.ownerKind === 'component' ? (parsed.data.ownerId as ComponentId) : undefined,
    name: parsed.data.name,
    type: parsed.data.type,
    category: parsed.data.category,
    unitId: parsed.data.unitId ? (parsed.data.unitId as UnitId) : undefined,
    options:
      parsed.data.type === 'enum' || parsed.data.type === 'multi_enum'
        ? parseOptions(parsed.data.options)
        : undefined,
    createdBy: auth.userId,
  });
  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return {};
}

const numberField = z.coerce.number({ message: 'Enter a number.' }).finite();
const unitField = z.string().uuid({ message: 'Pick a unit.' });

/** Build the typed FieldValue from per-type form inputs; Zod re-validates the
 *  whole union in updateFieldValue before anything is written. */
const valueBuilders: Record<string, (form: FormData, field: { options: string[] | null }) => unknown> = {
  scalar: (f) => ({
    value: numberField.parse(f.get('value')),
    unit_id: unitField.parse(f.get('unitId')),
  }),
  range: (f) => ({
    min: numberField.parse(f.get('min')),
    max: numberField.parse(f.get('max')),
    unit_id: unitField.parse(f.get('unitId')),
  }),
  toleranced: (f) => ({
    nominal: numberField.parse(f.get('nominal')),
    tolerance: numberField.parse(f.get('tolerance')),
    tolerance_type: z.enum(['absolute', 'percentage']).parse(f.get('toleranceType')),
    unit_id: unitField.parse(f.get('unitId')),
  }),
  boolean: (f) => ({ value: f.get('value') === 'true' }),
  enum: (f, field) => ({
    selected: z.string().min(1, 'Pick a value.').parse(f.get('selected')),
    options: field.options ?? [],
  }),
  multi_enum: (f, field) => ({
    selected: f.getAll('selected').map(String),
    options: field.options ?? [],
  }),
};

export async function updateFieldValueAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const head = z
    .object({ fieldId: z.string().uuid(), type: fieldTypeSchema })
    .safeParse({ fieldId: formData.get('fieldId'), type: formData.get('type') });
  if (!head.success) return { error: 'Invalid field reference.' };

  const builder = valueBuilders[head.data.type];
  if (!builder) return { error: `No editor for ${head.data.type} fields yet.` };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  // The field's option list is authoritative for enum values (spec §4.6).
  const { data: fieldRow } = await auth.supabase
    .from('spec_fields')
    .select('options')
    .eq('id', head.data.fieldId)
    .single();
  if (!fieldRow) return { error: 'Field not found.' };

  let value: unknown;
  try {
    value = builder(formData, fieldRow as { options: string[] | null });
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : 'Invalid value.' };
  }

  try {
    await updateFieldValue(auth.supabase, {
      fieldId: head.data.fieldId as SpecFieldId,
      type: head.data.type,
      value,
    });
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : 'Could not save the value.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return {};
}

const componentSchema = z.object({
  name: z.string().trim().min(1, 'Name the component.'),
  componentType: z.enum(['assembly', 'module', 'part']).default('part'),
});

export async function createComponentAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = componentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  await createComponent(auth.supabase, {
    workspaceId: auth.workspace.id,
    name: parsed.data.name,
    type: parsed.data.componentType,
    createdBy: auth.userId,
  });
  revalidatePath('/specs/library');
  return {};
}

const attachSchema = z.object({
  productId: z.string().uuid(),
  componentId: z.string().uuid({ message: 'Pick a component.' }),
  quantity: z.coerce.number().int().positive().default(1),
});

export async function attachComponentAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = attachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  await addComponentToProduct(auth.supabase, {
    workspaceId: auth.workspace.id,
    productId: parsed.data.productId as ProductId,
    componentId: parsed.data.componentId as ComponentId,
    quantity: parsed.data.quantity,
    createdBy: auth.userId,
  });
  revalidatePath('/specs');
  return {};
}
