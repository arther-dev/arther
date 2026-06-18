import type { SupabaseClient } from '@supabase/supabase-js';
import {
  blockPlainText,
  type BlockContent,
  type DocumentId,
  type DocumentRevisionId,
  type LibraryItemId,
  type UserId,
  type WorkspaceId,
} from '@arther/types';
import { reorderBlocks } from './documents';
import { getLibraryItem } from './library';

/**
 * R.2 — snippet transclusion. A snippet embed is a **live** placement: ONE block
 * (type/source `snippet`, `snippet_id`) whose content carries the snippet id +
 * name, paired 1:1 with a `snippet_embeds` row holding the embed state (0009).
 * The document stores a reference, not a copy — so editing the source library
 * item propagates to every live embed. The blocks are materialized into the
 * frozen content only at **publish** (`expandSnippetsForPublish`), keeping the
 * portal snapshot self-contained (the portal needs no snippet awareness).
 *
 * The override model (live / overridden / source_changed) layers on top in a
 * later slice; every embed created here starts `live`.
 */

export type InsertSnippetEmbedError = 'not_found' | 'archived' | 'not_snippet' | 'empty';

export interface InsertedSnippetEmbed {
  block: { id: string; content: BlockContent; type: string; source: string };
  orderedIds: string[];
}

interface BlockOrderRow {
  id: string;
}

export async function insertSnippetEmbed(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    documentId: DocumentId;
    revisionId: DocumentRevisionId;
    libraryItemId: LibraryItemId;
    afterBlockId: string | null;
    userId: UserId;
  },
): Promise<InsertedSnippetEmbed | { error: InsertSnippetEmbedError }> {
  const item = await getLibraryItem(client, input.libraryItemId);
  if (!item) return { error: 'not_found' };
  if (item.archivedAt) return { error: 'archived' };
  if (item.type !== 'snippet') return { error: 'not_snippet' };
  if (item.blocks.length === 0) return { error: 'empty' };

  const content: BlockContent = {
    type: 'snippet',
    snippet_id: input.libraryItemId,
    snippet_name: item.name,
    last_resolved_at: new Date().toISOString(),
  };
  // The placement's search projection is the snippet's current plain text, so
  // in-app search finds the embedded content even though it's stored by reference.
  const textContent =
    item.blocks.map((b) => blockPlainText(b)).filter((t) => t.trim().length > 0).join(' ') || null;

  const { data: existing, error: orderErr } = await client
    .from('blocks')
    .select('id')
    .eq('revision_id', input.revisionId)
    .order('display_order', { ascending: true });
  if (orderErr) throw new Error(`insertSnippetEmbed.order: ${orderErr.message}`);
  const existingIds = (existing ?? []).map((r) => (r as BlockOrderRow).id);

  const { data: placement, error: insErr } = await client
    .from('blocks')
    .insert({
      workspace_id: input.workspaceId,
      document_id: input.documentId,
      revision_id: input.revisionId,
      type: 'snippet',
      source: 'snippet',
      snippet_id: input.libraryItemId,
      content,
      text_content: textContent,
      display_order: existingIds.length,
      created_by: input.userId,
    })
    .select('id, type, source, content')
    .single();
  if (insErr) throw new Error(`insertSnippetEmbed.block: ${insErr.message}`);

  const blockId = placement.id as string;
  const { error: embErr } = await client.from('snippet_embeds').insert({
    workspace_id: input.workspaceId,
    document_id: input.documentId,
    block_id: blockId,
    library_item_id: input.libraryItemId,
    state: 'live',
  });
  if (embErr) {
    // Roll back the orphan placement so a failed embed never leaves a dangling block.
    await client.from('blocks').delete().eq('id', blockId);
    throw new Error(`insertSnippetEmbed.embed: ${embErr.message}`);
  }

  const orderedIds = [...existingIds];
  const at = input.afterBlockId ? existingIds.indexOf(input.afterBlockId) : -1;
  orderedIds.splice(at >= 0 ? at + 1 : existingIds.length, 0, blockId);
  await reorderBlocks(client, orderedIds as Parameters<typeof reorderBlocks>[1], input.userId);

  return {
    block: {
      id: blockId,
      content: placement.content as BlockContent,
      type: placement.type as string,
      source: placement.source as string,
    },
    orderedIds,
  };
}

/**
 * R.2 — expand snippet placements into their resolved block content for a
 * published snapshot, so the snapshot is self-contained. A live embed expands to
 * the source library item's **current** blocks; an archived/missing source
 * contributes nothing (skipped). Non-snippet blocks pass through unchanged.
 * (Override states are honored in a later slice — all embeds are `live` today.)
 */
export async function expandSnippetsForPublish(
  client: SupabaseClient,
  blocks: { content: BlockContent }[],
): Promise<BlockContent[]> {
  const snippetIds = [
    ...new Set(
      blocks
        .map((b) => b.content)
        .filter((c): c is Extract<BlockContent, { type: 'snippet' }> => c.type === 'snippet')
        .map((c) => c.snippet_id),
    ),
  ];

  const sources = new Map<string, BlockContent[]>();
  for (const id of snippetIds) {
    const item = await getLibraryItem(client, id as LibraryItemId);
    if (item && !item.archivedAt) sources.set(id, item.blocks);
  }

  const out: BlockContent[] = [];
  for (const b of blocks) {
    if (b.content.type === 'snippet') {
      out.push(...(sources.get(b.content.snippet_id) ?? []));
    } else {
      out.push(b.content);
    }
  }
  return out;
}
