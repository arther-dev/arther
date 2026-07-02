'use server';

import { revalidatePath } from 'next/cache';
import {
  archiveConvertEmbedsToStatic,
  createLibraryItem,
  renameLibraryItem,
  rollbackLibraryItem,
  setLibraryItemArchived,
} from '@arther/db';
import {
  createLibraryItemSchema,
  defaultBlockContent,
  libraryItemIdSchema,
  renameLibraryItemSchema,
  type LibraryItemId,
} from '@arther/types';
import { authorizeAction } from '../../../lib/authorize';
import { reactToSnippetSourceChange } from './_lib/source-edit-reaction';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SnippetActionResult {
  ok: boolean;
  error?: string;
}

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
  return authorizeAction('doc.write', 'Only editors can manage the block library.');
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

/**
 * R.4 — roll a snippet back to a prior version (§3.7). Editor-gated; records a new
 * "Rolled back" version (history is append-only) and propagates to live embeds at
 * the next publish, while overridden embeds are flagged `source_changed` and their
 * owners notified — identical to a forward edit.
 */
export async function rollbackSnippetAction(
  id: string,
  versionId: string,
): Promise<SnippetActionResult> {
  const idParsed = libraryItemIdSchema.safeParse(id);
  if (!idParsed.success || !UUID_RE.test(versionId)) {
    return { ok: false, error: 'Invalid version reference.' };
  }

  const auth = await authorizeEdit();
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await rollbackLibraryItem(auth.supabase, {
      workspaceId: auth.workspace.id,
      id: idParsed.data,
      versionId,
      userId: auth.userId,
    });
  } catch {
    return { ok: false, error: 'Could not roll back to that version.' };
  }

  await reactToSnippetSourceChange(auth.supabase, {
    workspaceId: auth.workspace.id,
    libraryItemId: idParsed.data,
    actorId: auth.userId,
  });
  revalidatePath(`/snippets/${idParsed.data}`);
  revalidatePath(`/snippets/${idParsed.data}/edit`);
  return { ok: true };
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
    // R.5 — archiving converts live embeds to static copies first (§3.8), so they
    // keep their content rather than breaking when the source is archived. (Restore
    // leaves the frozen copies as overrides; the owner can accept-source to re-link.)
    if (archived) {
      await archiveConvertEmbedsToStatic(auth.supabase, idParsed.data, auth.userId);
    }
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
