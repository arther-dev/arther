'use server';

import { updateLibraryItemBlocks } from '@arther/db';
import { blockContentSchema, libraryItemIdSchema, type LibraryItemId } from '@arther/types';
import { authorizeAction } from '../../../../../lib/authorize';
import { reactToSnippetSourceChange } from '../../_lib/source-edit-reaction';

export interface SaveBlocksResult {
  ok: boolean;
  error?: string;
}

// A library item holds one or more blocks (0009). v4 boundary, like paste.
const blocksSchema = blockContentSchema.array().min(1).max(200);

/**
 * R.2c — persist a library item's edited block content, recording a version.
 * Editor-gated (`doc.write`), re-validated through `blockContentSchema` so a
 * malformed tree never reaches the store. Editing the source propagates to live
 * embeds at the next publish (they expand from the current source).
 */
export async function saveLibraryItemBlocksAction(
  id: string,
  blocks: unknown[],
): Promise<SaveBlocksResult> {
  const idParsed = libraryItemIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Invalid library item.' };
  const parsed = blocksSchema.safeParse(blocks);
  if (!parsed.success) return { ok: false, error: 'Add at least one block, and check each one’s content.' };

  const auth = await authorizeAction('doc.write', 'Viewers can’t edit the block library.');
  if ('error' in auth) return { ok: false, error: auth.error };

  try {
    await updateLibraryItemBlocks(auth.supabase, {
      workspaceId: auth.workspace.id,
      id: idParsed.data as LibraryItemId,
      blocks: parsed.data,
      userId: auth.userId,
    });
  } catch {
    return { ok: false, error: 'Could not save the library item.' };
  }

  // R.3b — re-editing the source diverges any *overridden* embed from a snapshot
  // it no longer tracks: flag those `source_changed` and notify each overriding
  // doc owner (shared with rollback, R.4). Best-effort; the save already committed.
  await reactToSnippetSourceChange(auth.supabase, {
    workspaceId: auth.workspace.id,
    libraryItemId: idParsed.data as LibraryItemId,
    actorId: auth.userId,
  });
  return { ok: true };
}
