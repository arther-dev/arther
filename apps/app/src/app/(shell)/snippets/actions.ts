'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import {
  createLibraryItem,
  getActiveWorkspace,
  membershipLookupFor,
  renameLibraryItem,
  setLibraryItemArchived,
} from '@arther/db';
import {
  createLibraryItemSchema,
  defaultBlockContent,
  libraryItemIdSchema,
  renameLibraryItemSchema,
  type LibraryItemId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../lib/supabase/server';

export interface SnippetFormState {
  error?: string;
  done?: boolean;
  /** Set after a successful create so the form can route to the new item. */
  createdId?: string;
}

/**
 * The block library is editor-level (owner/admin/member, viewers excluded) —
 * `doc.write`, matching the 0009 `is_workspace_editor` write RLS. Same
 * defence-in-depth posture as the other shell surfaces.
 */
async function authorizeEdit() {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' as const };

  const canDo = createCanDo(membershipLookupFor(supabase));
  const allowed = await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: workspace.id });
  if (!allowed) return { error: 'Only editors can manage the block library.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

export async function createSnippetAction(
  _prev: SnippetFormState,
  formData: FormData,
): Promise<SnippetFormState> {
  const parsed = createLibraryItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeEdit();
  if ('error' in auth) return { error: auth.error };

  let createdId: LibraryItemId;
  try {
    createdId = await createLibraryItem(auth.supabase, {
      workspaceId: auth.workspace.id,
      userId: auth.userId,
      name: parsed.data.name,
      type: parsed.data.type,
      // Seed a single empty paragraph so the item has renderable content; the
      // full block editor for library content lands with R.2.
      blocks: [defaultBlockContent('paragraph')],
    });
  } catch {
    return { error: 'Could not create the library item.' };
  }
  revalidatePath('/snippets');
  return { done: true, createdId };
}

export async function renameSnippetAction(
  _prev: SnippetFormState,
  formData: FormData,
): Promise<SnippetFormState> {
  const idParsed = libraryItemIdSchema.safeParse(formData.get('id'));
  const parsed = renameLibraryItemSchema.safeParse(Object.fromEntries(formData));
  if (!idParsed.success) return { error: 'Invalid library item reference.' };
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeEdit();
  if ('error' in auth) return { error: auth.error };

  try {
    await renameLibraryItem(auth.supabase, {
      id: idParsed.data,
      name: parsed.data.name,
      userId: auth.userId,
    });
  } catch {
    return { error: 'Could not rename the library item.' };
  }
  revalidatePath('/snippets');
  revalidatePath(`/snippets/${idParsed.data}`);
  return { done: true };
}

export async function setSnippetArchivedAction(
  _prev: SnippetFormState,
  formData: FormData,
): Promise<SnippetFormState> {
  const idParsed = libraryItemIdSchema.safeParse(formData.get('id'));
  const archived = formData.get('archived') === 'true';
  if (!idParsed.success) return { error: 'Invalid library item reference.' };

  const auth = await authorizeEdit();
  if ('error' in auth) return { error: auth.error };

  try {
    await setLibraryItemArchived(auth.supabase, {
      id: idParsed.data,
      archived,
      userId: auth.userId,
    });
  } catch {
    return { error: 'Could not update the library item.' };
  }
  revalidatePath('/snippets');
  revalidatePath(`/snippets/${idParsed.data}`);
  return { done: true };
}
