'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import {
  archiveDocumentType,
  createDocumentType,
  createSection,
  deleteSection,
  forkDocumentType,
  getActiveWorkspace,
  listDocumentTypes,
  membershipLookupFor,
  reorderSections,
  updateDocumentType,
  updateSection,
} from '@arther/db';
import { optionalText, requiredText, TEXT_LIMITS, type UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface DocTypeFormState {
  error?: string;
  done?: boolean;
}

/**
 * Document Types are an admin Settings surface (spec §3.4 — "a workspace admin
 * owns Brand Profiles"; the 0004 write policy is owner/admin). canDo
 * 'workspace.manage' is exactly that tier, so it gates every mutation here while
 * RLS enforces the same at the row (defence in depth, ADR-010).
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
  if (!allowed) return { error: 'Only workspace admins can manage Document Types.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

/** Comma-separated category names → a clean, de-duplicated list. */
function parseCategories(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (name && name.length <= TEXT_LIMITS.category) seen.add(name);
  }
  return [...seen];
}

const createSchema = z.object({
  name: requiredText('Name the Document Type.'),
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
      description: parsed.data.description ?? null,
      createdBy: auth.userId,
    });
  } catch {
    return { error: 'Could not create the Document Type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

/** Fork a built-in (or any readable type) into an editable workspace copy (0017). */
export async function forkDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({ sourceId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid Document Type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await forkDocumentType(auth.supabase, {
      sourceId: parsed.data.sourceId,
      workspaceId: auth.workspace.id,
    });
  } catch {
    return { error: 'Could not fork the Document Type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function renameDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      name: requiredText('Name the Document Type.'),
      description: optionalText(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateDocumentType(auth.supabase, {
      id: parsed.data.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not update the Document Type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function archiveDocumentTypeAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid Document Type reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await archiveDocumentType(auth.supabase, parsed.data.id);
  } catch {
    return { error: 'Could not archive the Document Type.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

const sectionSchema = z.object({
  name: requiredText('Name the section.'),
  categories: z.string().max(TEXT_LIMITS.options).optional().default(''),
  briefRequired: z
    .union([z.literal('on'), z.literal('')])
    .optional()
    .transform((v) => v === 'on'),
});

export async function addSectionAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const idParsed = z.string().uuid().safeParse(formData.get('documentTypeId'));
  const parsed = sectionSchema.safeParse(Object.fromEntries(formData));
  if (!idParsed.success || !parsed.success) {
    return { error: parsed.success ? 'Invalid Document Type reference.' : parsed.error.issues[0]!.message };
  }

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  // Next display_order = one past the current max for this type.
  const types = await listDocumentTypes(auth.supabase, auth.workspace.id);
  const type = types.find((t) => t.id === idParsed.data);
  if (!type || type.built_in) return { error: 'Built-in types can’t be edited — fork first.' };
  const nextOrder = type.sections.reduce((max, s) => Math.max(max, s.display_order), 0) + 1;

  try {
    await createSection(auth.supabase, {
      workspaceId: auth.workspace.id,
      documentTypeId: idParsed.data,
      name: parsed.data.name,
      displayOrder: nextOrder,
      specFieldCategories: parseCategories(parsed.data.categories),
      briefRequired: parsed.data.briefRequired,
      createdBy: auth.userId,
    });
  } catch {
    return { error: 'Could not add the section.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function updateSectionAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const idParsed = z.string().uuid().safeParse(formData.get('id'));
  const parsed = sectionSchema.safeParse(Object.fromEntries(formData));
  if (!idParsed.success || !parsed.success) {
    return { error: parsed.success ? 'Invalid section reference.' : parsed.error.issues[0]!.message };
  }

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateSection(auth.supabase, {
      id: idParsed.data,
      name: parsed.data.name,
      specFieldCategories: parseCategories(parsed.data.categories),
      briefRequired: parsed.data.briefRequired,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not update the section.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

export async function deleteSectionAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid section reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await deleteSection(auth.supabase, parsed.data.id);
  } catch {
    return { error: 'Could not remove the section.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}

/** Move one section up/down by swapping it with its neighbour, then persisting the order. */
export async function moveSectionAction(
  _prev: DocTypeFormState,
  formData: FormData,
): Promise<DocTypeFormState> {
  const parsed = z
    .object({
      documentTypeId: z.string().uuid(),
      sectionId: z.string().uuid(),
      direction: z.enum(['up', 'down']),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid move.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  const types = await listDocumentTypes(auth.supabase, auth.workspace.id);
  const type = types.find((t) => t.id === parsed.data.documentTypeId);
  if (!type || type.built_in) return { error: 'Built-in types can’t be edited — fork first.' };

  const ordered = [...type.sections].sort((a, b) => a.display_order - b.display_order);
  const idx = ordered.findIndex((s) => s.id === parsed.data.sectionId);
  if (idx < 0) return { error: 'Section not found.' };
  const swapWith = parsed.data.direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return { done: true }; // already at the edge

  [ordered[idx], ordered[swapWith]] = [ordered[swapWith]!, ordered[idx]!];

  try {
    await reorderSections(auth.supabase, {
      orderedIds: ordered.map((s) => s.id),
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not reorder the sections.' };
  }
  revalidatePath('/settings/document-types');
  return { done: true };
}
