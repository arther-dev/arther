'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  assignApprovalRole,
  createApprovalRole,
  createDocumentType,
  createSection,
  deleteApprovalRole,
  deleteSection,
  forkDocumentType,
  getDocumentType,
  listApprovalRoles,
  reorderSections,
  setDocumentTypeArchived,
  unassignApprovalRole,
  updateApprovalRole,
  updateDocumentType,
  updateSection,
} from '@arther/db';
import {
  approvalRoleFormSchema,
  approvalRoleIdSchema,
  blockTypeSchema,
  documentTypeDescriptionSchema,
  documentTypeIdSchema,
  documentTypeNameSchema,
  documentTypeSectionInputSchema,
  documentTypeSectionIdSchema,
  membershipIdSchema,
  parseTokenList,
  requiredText,
  type DocumentTypeId,
  type DocumentTypeSectionId,
} from '@arther/types';
import { authorizeAction } from '../../../../lib/authorize';

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
  return authorizeAction('workspace.manage', 'Only workspace admins can configure document types.');
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

/**
 * G0.3 — Approval roles. Named reviewers per Document Type (required/optional)
 * plus member assignments, consumed by the Phase 3 AND-logic review machine.
 * Roles live on a workspace type (built-ins are forked first; the 0004 RLS
 * `workspace_id is not null` write guard enforces this). Same admin gate as the
 * rest of the Settings surface.
 */
export async function createApprovalRoleAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ documentTypeId: documentTypeIdSchema })
    .and(approvalRoleFormSchema)
    .safeParse({
      documentTypeId: formData.get('documentTypeId'),
      role_label: formData.get('roleLabel'),
      required: formData.get('required') === 'on',
    });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    const existing = await listApprovalRoles(auth.supabase, parsed.data.documentTypeId);
    await createApprovalRole(auth.supabase, {
      workspaceId: auth.workspace.id,
      documentTypeId: parsed.data.documentTypeId,
      label: parsed.data.role_label,
      required: parsed.data.required,
      displayOrder: existing.length + 1,
      createdBy: auth.userId,
    });
  } catch {
    return { error: 'Could not add the approval role — fork a built-in type first.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function updateApprovalRoleAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ id: approvalRoleIdSchema })
    .and(approvalRoleFormSchema)
    .safeParse({
      id: formData.get('id'),
      role_label: formData.get('roleLabel'),
      required: formData.get('required') === 'on',
    });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateApprovalRole(auth.supabase, {
      id: parsed.data.id,
      label: parsed.data.role_label,
      required: parsed.data.required,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not save the approval role.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function deleteApprovalRoleAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ id: approvalRoleIdSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid approval-role reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await deleteApprovalRole(auth.supabase, parsed.data.id);
  } catch {
    return { error: 'Could not delete the approval role.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function assignApprovalRoleAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ roleId: approvalRoleIdSchema, memberId: membershipIdSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Pick a member to assign.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await assignApprovalRole(auth.supabase, {
      workspaceId: auth.workspace.id,
      roleId: parsed.data.roleId,
      workspaceMemberId: parsed.data.memberId,
      assignedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not assign the member.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function unassignApprovalRoleAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ roleId: approvalRoleIdSchema, memberId: membershipIdSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid assignment reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await unassignApprovalRole(auth.supabase, {
      roleId: parsed.data.roleId,
      workspaceMemberId: parsed.data.memberId,
    });
  } catch {
    return { error: 'Could not remove the assignment.' };
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
