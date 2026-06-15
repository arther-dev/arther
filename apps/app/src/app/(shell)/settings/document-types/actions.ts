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
import { optionalText, requiredText, TEXT_LIMITS, type UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface DocumentTypeFormState {
  error?: string;
  done?: boolean;
}

/**
 * Document Types are an admin Settings surface (generator spec §3.4; 0004 write
 * policy is owner/admin). Every mutation routes through canDo('workspace.manage')
 * with the 0004 RLS behind it (defence in depth, guardrail 1).
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
  if (!allowed) return { error: 'Only workspace admins manage Document Types.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

const createSchema = z.object({
  name: requiredText('Name the document type.'),
  description: optionalText(TEXT_LIMITS.notes),
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

const updateSchema = z.object({
  id: z.string().uuid(),
  name: requiredText('Name the document type.'),
  description: optionalText(TEXT_LIMITS.notes),
});

export async function updateDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateDocumentType(auth.supabase, {
      id: parsed.data.id,
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

const forkSchema = z.object({ sourceId: z.string().uuid() });

/** Built-ins are forkable, not editable (§3.4) — fork yields an editable copy. */
export async function forkDocumentTypeAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = forkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid document type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await forkDocumentType(auth.supabase, {
      sourceId: parsed.data.sourceId,
      workspaceId: auth.workspace.id,
    });
  } catch {
    return { error: 'Could not fork the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

const archiveSchema = z.object({
  id: z.string().uuid(),
  archived: z.enum(['true', 'false']),
});

export async function setDocumentTypeArchivedAction(
  _prev: DocumentTypeFormState,
  formData: FormData,
): Promise<DocumentTypeFormState> {
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid archive request.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await setDocumentTypeArchived(auth.supabase, {
      id: parsed.data.id,
      archived: parsed.data.archived === 'true',
      userId: auth.userId,
    });
  } catch {
    return { error: 'Could not change the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}
