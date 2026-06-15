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
import { optionalText, requiredText, type DocumentTypeId, type UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface DocTypeFormState {
  error?: string;
  done?: boolean;
}

/**
 * Document Types are a Settings/admin surface (canDo 'doctype.manage' →
 * owner/admin, guardrail 1). RLS on document_types is the second layer: it
 * rejects writes to built-ins (workspace_id null) and to other tenants outright.
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
  const allowed = await canDo({ id: user.id as UserId }, 'doctype.manage', {
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
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
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

export async function forkDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ sourceId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid document type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await forkDocumentType(auth.supabase, {
      sourceId: parsed.data.sourceId as DocumentTypeId,
      workspaceId: auth.workspace.id,
    });
  } catch {
    return { error: 'Could not fork the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

const renameSchema = z.object({
  id: z.string().uuid(),
  name: requiredText('Name the document type.'),
  description: optionalText(),
});

export async function renameDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = renameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateDocumentType(auth.supabase, {
      id: parsed.data.id as DocumentTypeId,
      name: parsed.data.name,
      description: parsed.data.description,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not update the document type.' };
  }
  revalidatePath('/settings/document-types');
  revalidatePath(`/settings/document-types/${parsed.data.id}`);
  return { done: true };
}

export async function archiveDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ id: z.string().uuid(), archived: z.enum(['true', 'false']) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid archive request.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await setDocumentTypeArchived(auth.supabase, {
      id: parsed.data.id as DocumentTypeId,
      archived: parsed.data.archived === 'true',
      userId: auth.userId,
    });
  } catch {
    return { error: 'Could not update the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}
