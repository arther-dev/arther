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

export interface DocumentTypeFormState {
  error?: string;
  done?: boolean;
}

/**
 * Document Types are a Settings surface (generator spec §3.4 — "a workspace
 * admin owns Brand Profiles" and the same for types); writes are owner/admin
 * (canDo 'workspace.manage'), with RLS as the defence-in-depth row check.
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

const typeIdSchema = z.object({ typeId: z.string().uuid() });

/** Fork a built-in into an editable workspace copy (the 0017 RPC). */
export async function forkDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = typeIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid document type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await forkDocumentType(auth.supabase, {
      workspaceId: auth.workspace.id,
      sourceTypeId: parsed.data.typeId as DocumentTypeId,
    });
  } catch {
    return { error: 'Could not fork the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

const createSchema = z.object({
  name: requiredText('Name the document type.'),
  description: optionalText(),
});

/** Create a workspace Document Type from scratch (sections added later, G0.2). */
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
      description: parsed.data.description ?? null,
      createdBy: auth.userId,
    });
  } catch {
    return { error: 'Could not create the document type.' };
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
      typeId: parsed.data.typeId as DocumentTypeId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
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

/**
 * Archive / restore a workspace type. Archived types block new document
 * creation but leave already-generated documents untouched (spec §3.8).
 */
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
      typeId: parsed.data.typeId as DocumentTypeId,
      archived: parsed.data.archived === 'true',
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not change the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}
