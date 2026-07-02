'use server';

import { revalidatePath } from 'next/cache';
import {
  createQualityStandard,
  deleteQualityStandard,
  updateQualityStandard,
} from '@arther/db';
import {
  parseQualityConstraints,
  qualityStandardFormSchema,
  qualityStandardIdSchema,
  type QualityStandardForm,
  type QualityStandardId,
} from '@arther/types';
import { authorizeAction } from '../../../../lib/authorize';

export interface QualityStandardFormState {
  error?: string;
  done?: boolean;
  /** Set after a successful create so the form can route to the new editor. */
  createdId?: string;
}

/** Quality Standards are owner/admin (canDo 'workspace.manage', matching the 0004 RLS). */
async function authorizeManage() {
  return authorizeAction('workspace.manage', 'Only workspace admins can manage quality standards.');
}

function toConstraints(form: QualityStandardForm) {
  return parseQualityConstraints(form.constraints ?? '');
}

export async function createQualityStandardAction(
  _prev: QualityStandardFormState,
  formData: FormData,
): Promise<QualityStandardFormState> {
  const parsed = qualityStandardFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  let createdId: QualityStandardId;
  try {
    createdId = await createQualityStandard(auth.supabase, {
      workspaceId: auth.workspace.id,
      createdBy: auth.userId,
      name: parsed.data.name,
      constraints: toConstraints(parsed.data),
    });
  } catch {
    return { error: 'Could not create the quality standard.' };
  }
  revalidatePath('/settings/quality-standards');
  return { done: true, createdId };
}

export async function updateQualityStandardAction(
  _prev: QualityStandardFormState,
  formData: FormData,
): Promise<QualityStandardFormState> {
  const idParsed = qualityStandardIdSchema.safeParse(formData.get('id'));
  const parsed = qualityStandardFormSchema.safeParse(Object.fromEntries(formData));
  if (!idParsed.success) return { error: 'Invalid quality standard reference.' };
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateQualityStandard(auth.supabase, {
      id: idParsed.data,
      updatedBy: auth.userId,
      name: parsed.data.name,
      constraints: toConstraints(parsed.data),
    });
  } catch {
    return { error: 'Could not save the quality standard.' };
  }
  revalidatePath('/settings/quality-standards');
  revalidatePath(`/settings/quality-standards/${idParsed.data}`);
  return { done: true };
}

export async function deleteQualityStandardAction(
  _prev: QualityStandardFormState,
  formData: FormData,
): Promise<QualityStandardFormState> {
  const idParsed = qualityStandardIdSchema.safeParse(formData.get('id'));
  if (!idParsed.success) return { error: 'Invalid quality standard reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    const result = await deleteQualityStandard(auth.supabase, idParsed.data);
    if (result.blocked === 'referenced') {
      return {
        error: 'A document type still uses this standard — change those over before deleting it.',
      };
    }
  } catch {
    return { error: 'Could not delete the quality standard.' };
  }
  revalidatePath('/settings/quality-standards');
  return { done: true };
}
