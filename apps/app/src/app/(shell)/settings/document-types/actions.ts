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
  documentTypeDetailsSchema,
  documentTypeIdSchema,
  forkDocumentTypeSchema,
  type DocumentTypeId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface DocumentTypeFormState {
  error?: string;
  done?: boolean;
}

/** Document Types are a Settings surface — owner/admin only (canDo, 0004 policy). */
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

export async function createDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = documentTypeDetailsSchema.safeParse(Object.fromEntries(formData));
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

const forkSchema = forkDocumentTypeSchema.extend({ documentTypeId: documentTypeIdSchema });

export async function forkDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = forkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await forkDocumentType(auth.supabase, {
      documentTypeId: parsed.data.documentTypeId,
      workspaceId: auth.workspace.id,
      name: parsed.data.name,
    });
  } catch {
    return { error: 'Could not fork the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

const renameSchema = documentTypeDetailsSchema.extend({ documentTypeId: documentTypeIdSchema });

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
      id: parsed.data.documentTypeId,
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
  documentTypeId: documentTypeIdSchema,
  archived: z.enum(['true', 'false']),
});

export async function setDocumentTypeArchivedAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid document type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await setDocumentTypeArchived(auth.supabase, {
      id: parsed.data.documentTypeId as DocumentTypeId,
      archived: parsed.data.archived === 'true',
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not update the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}
