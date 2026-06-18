'use server';

import { createCanDo } from '@arther/authz';
import {
  createServiceClient,
  dispatchNotification,
  getActiveWorkspace,
  getLibraryItem,
  markOverriddenEmbedsSourceChanged,
  membershipLookupFor,
  updateLibraryItemBlocks,
} from '@arther/db';
import { blockContentSchema, libraryItemIdSchema, type LibraryItemId, type UserId } from '@arther/types';
import { getSupabaseServer } from '../../../../../lib/supabase/server';

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
  // it no longer tracks: flag those `source_changed` and tell each overriding doc
  // owner so they can accept the new source or keep their override. Best-effort —
  // the save already succeeded; live embeds simply follow the new source.
  try {
    const affected = await markOverriddenEmbedsSourceChanged(
      supabase,
      idParsed.data as LibraryItemId,
      user.id as UserId,
    );
    if (affected.length > 0) {
      const service = createServiceClient();
      const item = await getLibraryItem(service, idParsed.data as LibraryItemId);
      const docIds = [...new Set(affected.map((a) => a.documentId))];
      const { data: docs } = await service.from('documents').select('id, title').in('id', docIds);
      const titleById = new Map((docs ?? []).map((d) => [d.id as string, d.title as string]));
      const seen = new Set<string>();
      for (const emb of affected) {
        if (!emb.overrideCreatedBy || emb.overrideCreatedBy === user.id) continue;
        const key = `${emb.overrideCreatedBy}:${emb.documentId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await dispatchNotification(service, {
          workspaceId: workspace.id,
          recipientIds: [emb.overrideCreatedBy],
          eventType: 'snippet_source_changed',
          payload: {
            documentId: emb.documentId,
            documentTitle: titleById.get(emb.documentId),
            libraryItemId: idParsed.data,
            snippetName: item?.name,
          },
        });
      }
    }
  } catch {
    // best-effort — the reactive flag + notice never fail the save.
  }
  return { ok: true };
}
