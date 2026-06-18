import type { SupabaseClient } from '@supabase/supabase-js';
import { blockSpecFieldIds, type BlockContent, type LibraryItemId, type UserId, type WorkspaceId } from '@arther/types';

/**
 * R.9 — snippet staleness wiring (Content Reuse §3.6/§5.7). Spec tokens inside a
 * snippet auto-update like any token, but prose written *around* a spec value can
 * go semantically stale when that value moves. When a field changes, every snippet
 * that references it (an inline `spec_token`, a `spec_table` row, or a `chart`
 * field — found by scanning the library item's blocks) gets a `SnippetReviewItem`
 * for its owner and a `stale_prose_flag` on each of its embeds, which surfaces the
 * indicator on every embedding document. The owner resolves at the source by
 * editing the snippet (`clearSnippetStaleness`), which clears the flag everywhere.
 *
 * `flagSnippetsForFieldChange` runs under the service role (after propagation, in
 * the field-save action) so it can sweep the whole workspace; queries are scoped
 * by `workspace_id` explicitly. Returns the owners to notify.
 */

export interface FlaggedSnippet {
  snippetId: string;
  snippetName: string;
  ownerId: string | null;
}

interface SnippetRow {
  id: string;
  name: string;
  owner_id: string | null;
  blocks: BlockContent[] | string;
}

function parseBlocks(raw: BlockContent[] | string): BlockContent[] {
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? [];
}

export async function flagSnippetsForFieldChange(
  service: SupabaseClient,
  input: { workspaceId: WorkspaceId; fieldId: string; changedBy: UserId },
): Promise<FlaggedSnippet[]> {
  const { workspaceId, fieldId, changedBy } = input;

  // Active snippets in the workspace + their content.
  const { data: snippets, error } = await service
    .from('library_items')
    .select('id, name, owner_id, blocks')
    .eq('workspace_id', workspaceId)
    .eq('type', 'snippet')
    .is('archived_at', null);
  if (error) throw new Error(`flagSnippetsForFieldChange.snippets: ${error.message}`);

  // The field's most recent change record (created by propagation when documents
  // also cite it) gives the review item its "what changed" diff; optional.
  const { data: diff } = await service
    .from('field_change_diffs')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('field_id', fieldId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const diffIds = diff ? [(diff as { id: string }).id] : [];

  const flagged: FlaggedSnippet[] = [];
  for (const raw of (snippets ?? []) as SnippetRow[]) {
    const blocks = parseBlocks(raw.blocks);
    const affected: string[] = [];
    blocks.forEach((b, i) => {
      if (blockSpecFieldIds(b).includes(fieldId)) affected.push(String(i));
    });
    if (affected.length === 0) continue;

    // The documents embedding this snippet (for the review item + the indicator).
    const { data: embeds, error: emErr } = await service
      .from('snippet_embeds')
      .select('block_id, document_id')
      .eq('workspace_id', workspaceId)
      .eq('library_item_id', raw.id);
    if (emErr) throw new Error(`flagSnippetsForFieldChange.embeds: ${emErr.message}`);
    const documentIds = [...new Set((embeds ?? []).map((e) => (e as { document_id: string }).document_id))];

    // Coalesce into a single open review item per snippet (merge this change in).
    const { data: open } = await service
      .from('snippet_review_items')
      .select('id, field_change_diffs, affected_block_ids, embedding_document_ids')
      .eq('workspace_id', workspaceId)
      .eq('snippet_id', raw.id)
      .eq('status', 'pending')
      .maybeSingle();

    const union = (a: unknown, b: string[]): string[] => [
      ...new Set([...((a as string[] | null) ?? []), ...b]),
    ];

    if (open) {
      const row = open as {
        id: string;
        field_change_diffs: unknown;
        affected_block_ids: unknown;
        embedding_document_ids: unknown;
      };
      const { error: upErr } = await service
        .from('snippet_review_items')
        .update({
          field_change_diffs: union(row.field_change_diffs, diffIds),
          affected_block_ids: union(row.affected_block_ids, affected),
          embedding_document_ids: union(row.embedding_document_ids, documentIds),
        })
        .eq('id', row.id);
      if (upErr) throw new Error(`flagSnippetsForFieldChange.mergeItem: ${upErr.message}`);
    } else {
      const { error: insErr } = await service.from('snippet_review_items').insert({
        workspace_id: workspaceId,
        snippet_id: raw.id,
        snippet_name: raw.name,
        field_change_diffs: diffIds,
        affected_block_ids: affected,
        assigned_to: raw.owner_id,
        embedding_document_ids: documentIds,
        status: 'pending',
      });
      if (insErr) throw new Error(`flagSnippetsForFieldChange.item: ${insErr.message}`);
    }

    // Raise the indicator on every embed of this snippet.
    const { error: flagErr } = await service
      .from('snippet_embeds')
      .update({ stale_prose_flag: true, updated_by: changedBy })
      .eq('workspace_id', workspaceId)
      .eq('library_item_id', raw.id)
      .eq('stale_prose_flag', false);
    if (flagErr) throw new Error(`flagSnippetsForFieldChange.flag: ${flagErr.message}`);

    flagged.push({ snippetId: raw.id, snippetName: raw.name, ownerId: raw.owner_id });
  }
  return flagged;
}

/**
 * R.9 — the snippet owner resolves staleness at the source: editing the snippet
 * clears the `stale_prose_flag` on every embed (the indicator clears on every
 * embedding document, no action required from doc owners, §3.6) and resolves the
 * open review item. Idempotent; runs under the caller's editor client.
 */
export async function clearSnippetStaleness(
  client: SupabaseClient,
  input: { libraryItemId: LibraryItemId; userId: UserId },
): Promise<void> {
  const { error: flagErr } = await client
    .from('snippet_embeds')
    .update({ stale_prose_flag: false, stale_prose_resolved_locally: false, updated_by: input.userId })
    .eq('library_item_id', input.libraryItemId)
    .eq('stale_prose_flag', true);
  if (flagErr) throw new Error(`clearSnippetStaleness.flags: ${flagErr.message}`);

  const { error: itemErr } = await client
    .from('snippet_review_items')
    .update({ status: 'approved', resolved_at: new Date().toISOString(), resolved_by: input.userId })
    .eq('snippet_id', input.libraryItemId)
    .eq('status', 'pending');
  if (itemErr) throw new Error(`clearSnippetStaleness.items: ${itemErr.message}`);
}

/** R.9 — open (pending) snippet review items assigned to the signed-in owner. */
export interface SnippetReviewItemRow {
  id: string;
  snippetId: string;
  snippetName: string | null;
  embeddingDocumentCount: number;
  createdAt: string;
}

export async function listSnippetReviewItems(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
): Promise<SnippetReviewItemRow[]> {
  const { data, error } = await client
    .from('snippet_review_items')
    .select('id, snippet_id, snippet_name, embedding_document_ids, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listSnippetReviewItems: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const docs = (row.embedding_document_ids as string[] | null) ?? [];
    return {
      id: row.id as string,
      snippetId: row.snippet_id as string,
      snippetName: (row.snippet_name as string | null) ?? null,
      embeddingDocumentCount: docs.length,
      createdAt: row.created_at as string,
    };
  });
}
