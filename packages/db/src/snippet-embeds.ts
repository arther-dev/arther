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
 * R.2/R.3 — expand snippet placements into their resolved block content for a
 * published snapshot, so the snapshot is self-contained. A **live** embed expands
 * to the source library item's current blocks; an **overridden** /
 * **source_changed** embed expands to its `override_blocks` (the doc-local copy);
 * an archived/missing source contributes nothing. Non-snippet blocks pass through.
 */
export async function expandSnippetsForPublish(
  client: SupabaseClient,
  documentId: DocumentId,
  blocks: { id: string; content: BlockContent }[],
): Promise<BlockContent[]> {
  // Per-block embed state (override_blocks win over the live source).
  const { data: embedRows, error: embErr } = await client
    .from('snippet_embeds')
    .select('block_id, state, override_blocks')
    .eq('document_id', documentId);
  if (embErr) throw new Error(`expandSnippetsForPublish.embeds: ${embErr.message}`);
  const embeds = new Map(
    (embedRows ?? []).map((r) => {
      const row = r as { block_id: string; state: string; override_blocks: BlockContent[] | null };
      return [row.block_id, row];
    }),
  );

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
    if (b.content.type !== 'snippet') {
      out.push(b.content);
      continue;
    }
    const embed = embeds.get(b.id);
    if (embed && embed.state !== 'live' && embed.override_blocks) {
      out.push(...embed.override_blocks);
    } else {
      out.push(...(sources.get(b.content.snippet_id) ?? []));
    }
  }
  return out;
}

export type SnippetEmbedState = 'live' | 'overridden' | 'source_changed';

export interface DocumentSnippetEmbed {
  blockId: string;
  libraryItemId: string;
  libraryItemName: string;
  state: SnippetEmbedState;
  /** R.5 — the source snippet is archived; the embed is a frozen static copy. */
  sourceArchived: boolean;
}

/** R.3/R.5 — the snippet embeds in a document, with their override state + whether
 * the source is archived (a frozen static copy), for the panel. */
export async function listDocumentSnippetEmbeds(
  client: SupabaseClient,
  documentId: DocumentId,
): Promise<DocumentSnippetEmbed[]> {
  const { data, error } = await client
    .from('snippet_embeds')
    .select('block_id, state, library_item_id, library_items!inner(name, archived_at)')
    .eq('document_id', documentId);
  if (error) throw new Error(`listDocumentSnippetEmbeds: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const item = row.library_items as
      | { name: string; archived_at: string | null }
      | { name: string; archived_at: string | null }[];
    const source = Array.isArray(item) ? item[0] : item;
    return {
      blockId: row.block_id as string,
      libraryItemId: row.library_item_id as string,
      libraryItemName: source?.name ?? 'Snippet',
      state: row.state as SnippetEmbedState,
      sourceArchived: source?.archived_at != null,
    };
  });
}

/**
 * R.3 — the effective content of an embed for the override editor: the current
 * `override_blocks` if already overridden, otherwise the live source's blocks
 * (the starting point per spec §5.4). Returns the embed's state too.
 */
export async function getSnippetEmbedContent(
  client: SupabaseClient,
  blockId: string,
): Promise<{ state: SnippetEmbedState; libraryItemId: string; blocks: BlockContent[] } | null> {
  const { data, error } = await client
    .from('snippet_embeds')
    .select('state, library_item_id, override_blocks')
    .eq('block_id', blockId)
    .maybeSingle();
  if (error) throw new Error(`getSnippetEmbedContent: ${error.message}`);
  if (!data) return null;
  const row = data as { state: SnippetEmbedState; library_item_id: string; override_blocks: BlockContent[] | null };
  if (row.override_blocks) {
    return { state: row.state, libraryItemId: row.library_item_id, blocks: row.override_blocks };
  }
  const item = await getLibraryItem(client, row.library_item_id as LibraryItemId);
  return { state: row.state, libraryItemId: row.library_item_id, blocks: item?.blocks ?? [] };
}

/**
 * R.3 — apply a document-local override to an embed (§5.4): freeze the embed at
 * the edited content, recording the source version it diverged from (for the
 * source-changed detection in R.3b). Owner-gated at the call site.
 */
export async function overrideSnippetEmbed(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; blockId: string; overrideBlocks: BlockContent[]; userId: UserId },
): Promise<void> {
  const { data: embed, error: e1 } = await client
    .from('snippet_embeds')
    .select('library_item_id')
    .eq('block_id', input.blockId)
    .maybeSingle();
  if (e1) throw new Error(`overrideSnippetEmbed.lookup: ${e1.message}`);
  if (!embed) throw new Error('overrideSnippetEmbed: embed not found');

  const { data: version } = await client
    .from('library_item_versions')
    .select('version_id')
    .eq('library_item_id', (embed as { library_item_id: string }).library_item_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await client
    .from('snippet_embeds')
    .update({
      state: 'overridden',
      override_blocks: input.overrideBlocks,
      override_created_at: new Date().toISOString(),
      override_created_by: input.userId,
      source_version_at_override: (version as { version_id: string } | null)?.version_id ?? null,
      updated_by: input.userId,
    })
    .eq('block_id', input.blockId);
  if (error) throw new Error(`overrideSnippetEmbed: ${error.message}`);
}

/**
 * R.3 — accept the source (§5.6): discard the override and return the embed to a
 * live link, so it follows the snippet again. Works from `overridden` and
 * `source_changed` alike.
 */
export async function acceptSourceForEmbed(
  client: SupabaseClient,
  input: { blockId: string; userId: UserId },
): Promise<void> {
  const { error } = await client
    .from('snippet_embeds')
    .update({
      state: 'live',
      override_blocks: null,
      override_created_at: null,
      override_created_by: null,
      source_version_at_override: null,
      updated_by: input.userId,
    })
    .eq('block_id', input.blockId);
  if (error) throw new Error(`acceptSourceForEmbed: ${error.message}`);
}

export interface SourceChangedEmbed {
  blockId: string;
  documentId: string;
  overrideCreatedBy: string | null;
}

/**
 * R.3b — when a snippet source is re-edited, every embed that is currently
 * **overridden** diverges from a source it no longer tracks, so flag it
 * `source_changed` (the override content is kept — it still publishes — but the
 * owner is told the source moved). Returns the affected embeds (with the doc + the
 * owner who made the override) so the caller can notify them. Already-changed and
 * live embeds are untouched; editor-write under RLS (the source editor is an editor).
 */
export async function markOverriddenEmbedsSourceChanged(
  client: SupabaseClient,
  libraryItemId: LibraryItemId,
  userId: UserId,
): Promise<SourceChangedEmbed[]> {
  const { data, error } = await client
    .from('snippet_embeds')
    .update({ state: 'source_changed', updated_by: userId })
    .eq('library_item_id', libraryItemId)
    .eq('state', 'overridden')
    .select('block_id, document_id, override_created_by');
  if (error) throw new Error(`markOverriddenEmbedsSourceChanged: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as { block_id: string; document_id: string; override_created_by: string | null };
    return {
      blockId: row.block_id,
      documentId: row.document_id,
      overrideCreatedBy: row.override_created_by ?? null,
    };
  });
}

/**
 * R.3b — keep the override (§5.6): acknowledge a `source_changed` embed without
 * adopting the new source. The override content is unchanged; we re-anchor
 * `source_version_at_override` to the current source version and return to
 * `overridden`, so the embed only re-flags on the *next* source edit.
 */
export async function keepOverrideForEmbed(
  client: SupabaseClient,
  input: { blockId: string; userId: UserId },
): Promise<void> {
  const { data: embed, error: e1 } = await client
    .from('snippet_embeds')
    .select('library_item_id')
    .eq('block_id', input.blockId)
    .maybeSingle();
  if (e1) throw new Error(`keepOverrideForEmbed.lookup: ${e1.message}`);
  if (!embed) throw new Error('keepOverrideForEmbed: embed not found');

  const { data: version } = await client
    .from('library_item_versions')
    .select('version_id')
    .eq('library_item_id', (embed as { library_item_id: string }).library_item_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await client
    .from('snippet_embeds')
    .update({
      state: 'overridden',
      source_version_at_override: (version as { version_id: string } | null)?.version_id ?? null,
      updated_by: input.userId,
    })
    .eq('block_id', input.blockId);
  if (error) throw new Error(`keepOverrideForEmbed: ${error.message}`);
}

/**
 * R.5 — archiving a snippet converts its **live** embeds to static copies (§3.8),
 * so they keep their content instead of breaking when the source is gone. Each
 * live embed is frozen to the source's current blocks (`override_blocks`, state →
 * `overridden`); embeds already overridden / source_changed already hold a
 * self-contained copy and are left untouched. Returns the number frozen. Run this
 * **before** flipping `archived_at`. Editor-gated by RLS.
 */
export async function archiveConvertEmbedsToStatic(
  client: SupabaseClient,
  libraryItemId: LibraryItemId,
  userId: UserId,
): Promise<number> {
  const item = await getLibraryItem(client, libraryItemId);
  const sourceBlocks = item?.blocks ?? [];

  const { data: version } = await client
    .from('library_item_versions')
    .select('version_id')
    .eq('library_item_id', libraryItemId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await client
    .from('snippet_embeds')
    .update({
      state: 'overridden',
      override_blocks: sourceBlocks,
      override_created_at: new Date().toISOString(),
      override_created_by: userId,
      source_version_at_override: (version as { version_id: string } | null)?.version_id ?? null,
      updated_by: userId,
    })
    .eq('library_item_id', libraryItemId)
    .eq('state', 'live')
    .select('block_id');
  if (error) throw new Error(`archiveConvertEmbedsToStatic: ${error.message}`);
  return (data ?? []).length;
}
