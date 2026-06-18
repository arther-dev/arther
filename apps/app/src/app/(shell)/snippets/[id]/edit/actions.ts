'use server';

import { createCanDo } from '@arther/authz';
import { getActiveWorkspace, membershipLookupFor, updateLibraryItemBlocks } from '@arther/db';
import { blockContentSchema, libraryItemIdSchema, type LibraryItemId, type UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';
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

  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { ok: false, error: 'No workspace yet.' };

  const canDo = createCanDo(membershipLookupFor(supabase));
  if (!(await canDo({ id: user.id as UserId }, 'doc.write', { workspaceId: workspace.id }))) {
    return { ok: false, error: 'Viewers can’t edit the block library.' };
  }

  try {
    await updateLibraryItemBlocks(supabase, {
      workspaceId: workspace.id,
      id: idParsed.data as LibraryItemId,
      blocks: parsed.data,
      userId: user.id as UserId,
    });
  } catch {
    return { ok: false, error: 'Could not save the library item.' };
  }

  // R.3b — re-editing the source diverges any *overridden* embed from a snapshot
  // it no longer tracks: flag those `source_changed` and notify each overriding
  // doc owner (shared with rollback, R.4). Best-effort; the save already committed.
  await reactToSnippetSourceChange(supabase, {
    workspaceId: workspace.id,
    libraryItemId: idParsed.data as LibraryItemId,
    actorId: user.id as UserId,
  });
  return { ok: true };
}
