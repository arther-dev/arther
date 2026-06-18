import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createServiceClient,
  dispatchNotification,
  getLibraryItem,
  markOverriddenEmbedsSourceChanged,
} from '@arther/db';
import type { LibraryItemId, UserId, WorkspaceId } from '@arther/types';

/**
 * R.3b/R.4 — the reaction shared by every change to a snippet's source content
 * (an in-place edit **or** a rollback, which the spec §3.7 says behaves
 * identically): any embed currently **overridden** diverges from a snapshot it no
 * longer tracks, so flag those `source_changed` and tell each overriding doc owner
 * (`snippet_source_changed`). Best-effort and service-role for the fan-out — the
 * caller's source write has already committed; live embeds simply follow the new
 * source. Never throws.
 */
export async function reactToSnippetSourceChange(
  supabase: SupabaseClient,
  input: { workspaceId: WorkspaceId; libraryItemId: LibraryItemId; actorId: UserId },
): Promise<void> {
  try {
    const affected = await markOverriddenEmbedsSourceChanged(
      supabase,
      input.libraryItemId,
      input.actorId,
    );
    if (affected.length === 0) return;

    const service = createServiceClient();
    const item = await getLibraryItem(service, input.libraryItemId);
    const docIds = [...new Set(affected.map((a) => a.documentId))];
    const { data: docs } = await service.from('documents').select('id, title').in('id', docIds);
    const titleById = new Map((docs ?? []).map((d) => [d.id as string, d.title as string]));
    const seen = new Set<string>();
    for (const emb of affected) {
      if (!emb.overrideCreatedBy || emb.overrideCreatedBy === input.actorId) continue;
      const key = `${emb.overrideCreatedBy}:${emb.documentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await dispatchNotification(service, {
        workspaceId: input.workspaceId,
        recipientIds: [emb.overrideCreatedBy],
        eventType: 'snippet_source_changed',
        payload: {
          documentId: emb.documentId,
          documentTitle: titleById.get(emb.documentId),
          libraryItemId: input.libraryItemId,
          snippetName: item?.name,
        },
      });
    }
  } catch {
    // best-effort — the reactive flag + notice never fail the source write.
  }
}
