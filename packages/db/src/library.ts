import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlockContent,
  LibraryItemId,
  LibraryItemType,
  UserId,
  WorkspaceId,
} from '@arther/types';

/**
 * R.1 — the block library repository (Content Reuse). Thin, typed calls over the
 * user-JWT client (RLS active: members read, editors write — the 0009 policies).
 * A `library_items` row is a named block sequence, `snippet` or `template`; each
 * create/edit also records a `library_item_versions` snapshot (the rollback
 * target, R.4). Embeds, transclusion, and the override model are later R slices;
 * this layer owns the library itself (list / read / create / rename / archive).
 *
 * Deletion is deliberately not exposed: a snippet with active embeds must be
 * archived, not deleted (the 0009 `guard_library_item_hard_delete` trigger
 * enforces it), and archiving converts live embeds to static copies (R.5).
 */

export interface LibraryItemRow {
  id: LibraryItemId;
  name: string;
  type: LibraryItemType;
  ownerId: UserId | null;
  /** Denormalised count of active embeds (snippets); blocks deletion when > 0. */
  embedCount: number;
  archivedAt: string | null;
  updatedAt: string;
}

export interface LibraryItemVersionRow {
  versionId: string;
  changeNote: string | null;
  createdBy: UserId | null;
  createdAt: string;
}

export interface LibraryItemDetail extends LibraryItemRow {
  blocks: BlockContent[];
  createdAt: string;
  versions: LibraryItemVersionRow[];
}

const LIST_COLUMNS = 'id, name, type, owner_id, embed_count, archived_at, updated_at';

function toRow(raw: Record<string, unknown>): LibraryItemRow {
  return {
    id: raw.id as LibraryItemId,
    name: raw.name as string,
    type: raw.type as LibraryItemType,
    ownerId: (raw.owner_id as UserId | null) ?? null,
    embedCount: (raw.embed_count as number) ?? 0,
    archivedAt: (raw.archived_at as string | null) ?? null,
    updatedAt: raw.updated_at as string,
  };
}

/** The workspace's library items, newest activity first. Active only by default. */
export async function listLibraryItems(
  client: SupabaseClient,
  workspaceId: WorkspaceId,
  opts: { includeArchived?: boolean } = {},
): Promise<LibraryItemRow[]> {
  let query = client
    .from('library_items')
    .select(LIST_COLUMNS)
    .eq('workspace_id', workspaceId);
  if (!opts.includeArchived) query = query.is('archived_at', null);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error(`listLibraryItems: ${error.message}`);
  return (data ?? []).map((raw) => toRow(raw as Record<string, unknown>));
}

/** One library item with its block content and version history, or null. */
export async function getLibraryItem(
  client: SupabaseClient,
  id: LibraryItemId,
): Promise<LibraryItemDetail | null> {
  const { data, error } = await client
    .from('library_items')
    .select('id, name, type, owner_id, blocks, embed_count, archived_at, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getLibraryItem: ${error.message}`);
  if (!data) return null;

  const { data: versions, error: vErr } = await client
    .from('library_item_versions')
    .select('version_id, change_note, created_by, created_at')
    .eq('library_item_id', id)
    .order('created_at', { ascending: false });
  if (vErr) throw new Error(`getLibraryItem.versions: ${vErr.message}`);

  const raw = data as Record<string, unknown>;
  return {
    ...toRow(raw),
    blocks: (raw.blocks as BlockContent[]) ?? [],
    createdAt: raw.created_at as string,
    versions: (versions ?? []).map((v) => {
      const r = v as Record<string, unknown>;
      return {
        versionId: r.version_id as string,
        changeNote: (r.change_note as string | null) ?? null,
        createdBy: (r.created_by as UserId | null) ?? null,
        createdAt: r.created_at as string,
      };
    }),
  };
}

/**
 * Create a library item and record its first version. The owner defaults to the
 * creator (spec §5.1/§5.2). Two writes (item, then version) — both pass the same
 * editor RLS check; if the version insert fails the item still exists and a later
 * edit will version it, so we surface the item id regardless.
 */
export async function createLibraryItem(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    name: string;
    type: LibraryItemType;
    blocks: BlockContent[];
    ownerId?: UserId;
    userId: UserId;
  },
): Promise<LibraryItemId> {
  const { data, error } = await client
    .from('library_items')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      type: input.type,
      owner_id: input.ownerId ?? input.userId,
      blocks: input.blocks,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createLibraryItem: ${error.message}`);
  const id = data.id as LibraryItemId;

  const { error: vErr } = await client.from('library_item_versions').insert({
    workspace_id: input.workspaceId,
    library_item_id: id,
    blocks_snapshot: input.blocks,
    change_note: 'Created',
    created_by: input.userId,
  });
  if (vErr) throw new Error(`createLibraryItem.version: ${vErr.message}`);
  return id;
}

/** Rename a library item. */
export async function renameLibraryItem(
  client: SupabaseClient,
  input: { id: LibraryItemId; name: string; userId: UserId },
): Promise<void> {
  const { error } = await client
    .from('library_items')
    .update({ name: input.name, updated_by: input.userId })
    .eq('id', input.id);
  if (error) throw new Error(`renameLibraryItem: ${error.message}`);
}

/**
 * R.2c/R.4 — replace a library item's block content and record a new version. The
 * version snapshot is the rollback target (R.4) and the change history. Editing
 * the source propagates to every **live** embed automatically (they expand from
 * the current source at publish); the caller reacts for **overridden** embeds by
 * flagging them `source_changed` (`markOverriddenEmbedsSourceChanged`, R.3b).
 */
export async function updateLibraryItemBlocks(
  client: SupabaseClient,
  input: {
    workspaceId: WorkspaceId;
    id: LibraryItemId;
    blocks: BlockContent[];
    changeNote?: string;
    userId: UserId;
  },
): Promise<void> {
  const { error } = await client
    .from('library_items')
    .update({ blocks: input.blocks, updated_by: input.userId })
    .eq('id', input.id);
  if (error) throw new Error(`updateLibraryItemBlocks: ${error.message}`);

  const { error: vErr } = await client.from('library_item_versions').insert({
    workspace_id: input.workspaceId,
    library_item_id: input.id,
    blocks_snapshot: input.blocks,
    change_note: input.changeNote ?? 'Edited',
    created_by: input.userId,
  });
  if (vErr) throw new Error(`updateLibraryItemBlocks.version: ${vErr.message}`);
}

/**
 * R.4 — roll a library item back to a prior version (§3.7). Rollback is just a
 * forward edit whose content is an older snapshot: it writes the snapshot as the
 * current blocks and records a **new** version (history is append-only — the
 * rolled-back-to version is preserved, and a fresh "Rolled back" version tops the
 * stack). Live embeds follow it at the next publish; the caller reacts for
 * overridden embeds exactly as for an edit (`reactToSnippetSourceChange`). Returns
 * the restored blocks. Editor-gated by RLS.
 */
export async function rollbackLibraryItem(
  client: SupabaseClient,
  input: { workspaceId: WorkspaceId; id: LibraryItemId; versionId: string; userId: UserId },
): Promise<BlockContent[]> {
  const { data, error } = await client
    .from('library_item_versions')
    .select('blocks_snapshot, created_at')
    .eq('version_id', input.versionId)
    .eq('library_item_id', input.id)
    .maybeSingle();
  if (error) throw new Error(`rollbackLibraryItem.version: ${error.message}`);
  if (!data) throw new Error('rollbackLibraryItem: version not found');

  const raw = (data as { blocks_snapshot: BlockContent[] }).blocks_snapshot;
  const blocks = (typeof raw === 'string' ? JSON.parse(raw) : raw) as BlockContent[];
  const when = new Date((data as { created_at: string }).created_at).toISOString().slice(0, 10);
  await updateLibraryItemBlocks(client, {
    workspaceId: input.workspaceId,
    id: input.id,
    blocks,
    changeNote: `Rolled back to the version from ${when}`,
    userId: input.userId,
  });
  return blocks;
}

/**
 * Archive (or restore) a library item. Archiving is the safe alternative to
 * deletion for a snippet with embeds (R.5 converts those embeds to static copies;
 * this slice flips the flag — the deletion guard already prevents a hard delete).
 */
export async function setLibraryItemArchived(
  client: SupabaseClient,
  input: { id: LibraryItemId; archived: boolean; userId: UserId },
): Promise<void> {
  const { error } = await client
    .from('library_items')
    .update({
      archived_at: input.archived ? new Date().toISOString() : null,
      archived_by: input.archived ? input.userId : null,
      updated_by: input.userId,
    })
    .eq('id', input.id);
  if (error) throw new Error(`setLibraryItemArchived: ${error.message}`);
}
