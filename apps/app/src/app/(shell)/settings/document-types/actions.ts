'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import {
  createDocumentType,
  forkDocumentType,
  getActiveWorkspace,
  membershipLookupFor,
  setDocumentTypeArchived,
  updateDocumentType,
} from '@arther/db';
import {
  optionalText,
  requiredText,
  type DocumentTypeId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface DocumentTypeFormState {
  error?: string;
  done?: boolean;
}

/**
 * Document Types are a Settings surface (admin-managed, like Brand Profiles and
 * approval-role assignment) — gated on canDo 'workspace.manage'. The 0004 RLS
 * write policy is the second, independent gate (admin-or-owner, workspace_id
 * not null), so a built-in can never be mutated even if this check regressed.
 */
async function authorizeManage() {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' as const };

  const canDo = createCanDo(membershipLookupFor(supabase));
  const allowed = await canDo({ id: user.id as UserId }, 'workspace.manage', {
    workspaceId: workspace.id,
  });
  if (!allowed) return { error: 'Only workspace admins can manage document types.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

const createSchema = z.object({
  name: requiredText('Name the document type.'),
  description: optionalText(),
});

export async function createDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await createDocumentType(auth.supabase, {
      workspaceId: auth.workspace.id,
      name: parsed.data.name,
      description: parsed.data.description,
      createdBy: auth.userId,
    });
  } catch {
    return { error: 'Could not create the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

/** Fork a built-in into an editable workspace copy (0017 RPC, atomic). */
export async function forkDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = z
    .object({ typeId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid document type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await forkDocumentType(auth.supabase, {
      typeId: parsed.data.typeId as DocumentTypeId,
      workspaceId: auth.workspace.id,
    });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('only built-in')
          ? 'Only built-in document types can be forked.'
          : 'Could not fork the document type.',
    };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

const renameSchema = z.object({
  typeId: z.string().uuid(),
  name: requiredText('Name the document type.'),
  description: optionalText(),
});

export async function renameDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = renameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateDocumentType(auth.supabase, {
      id: parsed.data.typeId as DocumentTypeId,
      name: parsed.data.name,
      description: parsed.data.description,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not update the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

const archiveSchema = z.object({
  typeId: z.string().uuid(),
  archived: z.enum(['true', 'false']),
});

export async function archiveDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid archive request.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await setDocumentTypeArchived(auth.supabase, {
      id: parsed.data.typeId as DocumentTypeId,
      archived: parsed.data.archived === 'true',
      userId: auth.userId,
    });
  } catch {
    return { error: 'Could not update the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}
