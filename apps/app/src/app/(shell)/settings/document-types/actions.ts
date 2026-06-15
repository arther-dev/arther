'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import {
  createDocumentType,
  createSection,
  deleteSection,
  forkDocumentType,
  getActiveWorkspace,
  getDocumentType,
  membershipLookupFor,
  reorderSections,
  setDocumentTypeArchived,
  updateDocumentType,
  updateSection,
} from '@arther/db';
import {
  blockTypeSchema,
  documentTypeDescriptionSchema,
  documentTypeIdSchema,
  documentTypeNameSchema,
  documentTypeSectionInputSchema,
  documentTypeSectionIdSchema,
  parseTokenList,
  requiredText,
  type DocumentTypeId,
  type DocumentTypeSectionId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface DocTypeFormState {
  error?: string;
  done?: boolean;
}

/**
 * Document Types are a Settings surface (generator spec §2: Workspace Admins
 * configure them). Every mutation routes through canDo 'workspace.manage'
 * (owner/admin), with the 0004 admin-write RLS policies as defence in depth.
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
  if (!allowed) return { error: 'Only workspace admins can configure document types.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

export async function createDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ name: documentTypeNameSchema, description: documentTypeDescriptionSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  let newId: DocumentTypeId;
  try {
    newId = await createDocumentType(auth.supabase, {
      workspaceId: auth.workspace.id,
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      createdBy: auth.userId,
    });
  } catch {
    return { error: 'Could not create the document type.' };
  }
  revalidatePath('/settings/document-types');
  redirect(`/settings/document-types?type=${newId}`);
}

/** Fork a built-in (or duplicate a workspace type) into an editable copy (§3.4). */
export async function forkDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ sourceId: documentTypeIdSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid document type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  let newId: DocumentTypeId;
  try {
    newId = await forkDocumentType(auth.supabase, {
      sourceId: parsed.data.sourceId,
      workspaceId: auth.workspace.id,
    });
  } catch {
    return { error: 'Could not fork the document type.' };
  }
  revalidatePath('/settings/document-types');
  redirect(`/settings/document-types?type=${newId}`);
}

export async function renameDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({
      id: documentTypeIdSchema,
      name: documentTypeNameSchema,
      description: documentTypeDescriptionSchema,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateDocumentType(auth.supabase, {
      id: parsed.data.id,
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not save — built-in types are forked, not edited.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function archiveDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ id: documentTypeIdSchema, archived: z.enum(['true', 'false']) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid request.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await setDocumentTypeArchived(auth.supabase, {
      id: parsed.data.id,
      archived: parsed.data.archived === 'true',
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not update the document type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

/** Build the validated section data contract from the section editor's fields. */
function parseSection(formData: FormData) {
  return documentTypeSectionInputSchema.safeParse({
    name: requiredText('Name the section.').safeParse(formData.get('name')).data ?? '',
    spec_field_categories: parseTokenList(formData.get('categories') as string | null),
    brief_fragment_keys: parseTokenList(formData.get('briefKeys') as string | null),
    brief_required: formData.get('briefRequired') === 'on',
    default_block_types: formData
      .getAll('blockTypes')
      .map((b) => blockTypeSchema.safeParse(b).data)
      .filter((b): b is NonNullable<typeof b> => Boolean(b)),
  });
}

/** Create a new section (no sectionId) or update an existing one (G0.2). */
export async function saveSectionAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const ids = z
    .object({
      documentTypeId: documentTypeIdSchema,
      sectionId: documentTypeSectionIdSchema.optional(),
    })
    .safeParse({
      documentTypeId: formData.get('documentTypeId'),
      sectionId: formData.get('sectionId') || undefined,
    });
  if (!ids.success) return { error: 'Invalid section reference.' };

  const section = parseSection(formData);
  if (!section.success) return { error: section.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    if (ids.data.sectionId) {
      await updateSection(auth.supabase, {
        id: ids.data.sectionId,
        section: section.data,
        updatedBy: auth.userId,
      });
    } else {
      const existing = await getDocumentType(auth.supabase, ids.data.documentTypeId);
      const nextOrder = (existing?.sections.length ?? 0) + 1;
      await createSection(auth.supabase, {
        workspaceId: auth.workspace.id,
        documentTypeId: ids.data.documentTypeId,
        section: section.data,
        displayOrder: nextOrder,
        createdBy: auth.userId,
      });
    }
  } catch {
    return { error: 'Could not save the section.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function deleteSectionAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ sectionId: documentTypeSectionIdSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid section reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await deleteSection(auth.supabase, parsed.data.sectionId);
  } catch {
    return { error: 'Could not delete the section.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

/** Move a section up or down by one — reorders the whole list (G0.2). */
export async function moveSectionAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({
      documentTypeId: documentTypeIdSchema,
      sectionId: documentTypeSectionIdSchema,
      direction: z.enum(['up', 'down']),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid move request.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    const detail = await getDocumentType(auth.supabase, parsed.data.documentTypeId);
    if (!detail) return { error: 'Document type not found.' };
    const order = detail.sections.map((s) => s.id);
    const i = order.indexOf(parsed.data.sectionId);
    const j = parsed.data.direction === 'up' ? i - 1 : i + 1;
    if (i === -1 || j < 0 || j >= order.length) return { done: true }; // already at an edge
    [order[i], order[j]] = [order[j]!, order[i]!];
    await reorderSections(auth.supabase, {
      orderedSectionIds: order as DocumentTypeSectionId[],
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not reorder the sections.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}
