import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * R.2 — snippet embeds (0009 + the 0023 embed-count triggers). A snippet embed is
 * a placement block + a `snippet_embeds` row. Locks:
 *   • inserting an embed bumps library_items.embed_count; deleting the placing
 *     block cascades the embed away and decrements the count (0023 triggers);
 *   • the 0009 hard-delete guard blocks deleting a library item with a live embed
 *     (archive instead); once embeds are gone the delete succeeds;
 *   • snippet_embeds is editor-write — a viewer is denied.
 */

let admin: Sql;
let owner: Sql;
let viewer: Sql;
let ownerId: string;
let viewerId: string;
let ws: string;
let documentId: string;
let revisionId: string;
let itemId: string;

const snippetParagraph = { type: 'paragraph', content: { alignment: 'left', nodes: [] } };

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `se-owner-${run}@example.com`);
  viewerId = await createAuthUser(admin, `se-viewer-${run}@example.com`);
  owner = await userClient(ownerId);
  viewer = await userClient(viewerId);

  ws = (await owner`select public.create_workspace('Embeds', ${uniqueSlug('emb')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;

  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Widget', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Guide', 'guide', ${ownerId}, ${ownerId}) returning id
    `
  )[0]!.id as string;
  revisionId = (
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${ownerId}) returning id
    `
  )[0]!.id as string;
  itemId = (
    await owner`
      insert into public.library_items (workspace_id, name, type, blocks, created_by)
      values (${ws}, 'Warranty', 'snippet', ${owner.json([snippetParagraph])}, ${ownerId}) returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), viewer.end()]);
});

async function placeEmbed(client: Sql): Promise<string> {
  const blockId = (
    await client`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, snippet_id, content, created_by)
      values (${ws}, ${documentId}, ${revisionId}, 'snippet', 0, 'snippet', ${itemId},
              ${client.json({ type: 'snippet', snippet_id: itemId, snippet_name: 'Warranty' })}, ${ownerId})
      returning id
    `
  )[0]!.id as string;
  await client`
    insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id, state)
    values (${ws}, ${documentId}, ${blockId}, ${itemId}, 'live')
  `;
  return blockId;
}

const embedCount = async (): Promise<number> =>
  Number((await owner`select embed_count from public.library_items where id = ${itemId}`)[0]!.embed_count);

describe('snippet embeds + count (0009/0023)', () => {
  it('embedding bumps the count and a live embed blocks deleting the source', async () => {
    expect(await embedCount()).toBe(0);
    const blockId = await placeEmbed(owner);
    expect(await embedCount()).toBe(1);

    // The 0009 guard blocks hard-deleting a library item that has a live embed.
    const msg = await expectDenied(() => owner`delete from public.library_items where id = ${itemId}`);
    expect(msg).toMatch(/active embeds|archive/i);

    // Removing the placing block cascades the embed away and the count drops.
    await owner`delete from public.blocks where id = ${blockId}`;
    expect(await embedCount()).toBe(0);
  });

  it('once embeds are gone the source can be hard-deleted', async () => {
    // Use a throwaway snippet so the shared itemId stays available for other tests.
    const tmp = (
      await owner`
        insert into public.library_items (workspace_id, name, type, created_by)
        values (${ws}, 'Throwaway', 'snippet', ${ownerId}) returning id
      `
    )[0]!.id as string;
    const blk = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, snippet_id, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'snippet', 5, 'snippet', ${tmp},
                ${owner.json({ type: 'snippet', snippet_id: tmp, snippet_name: 'Throwaway' })}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    await owner`insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id, state) values (${ws}, ${documentId}, ${blk}, ${tmp}, 'live')`;
    await owner`delete from public.blocks where id = ${blk}`;
    await owner`delete from public.library_items where id = ${tmp}`;
    expect(await owner`select id from public.library_items where id = ${tmp}`).toHaveLength(0);
  });

  it('a viewer cannot create a snippet embed', async () => {
    const blockId = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, snippet_id, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'snippet', 9, 'snippet', ${itemId},
                ${owner.json({ type: 'snippet', snippet_id: itemId, snippet_name: 'Warranty' })}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    await expectDenied(
      () =>
        viewer`insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id) values (${ws}, ${documentId}, ${blockId}, ${itemId})`,
    );
  });
});

/**
 * R.3 — the override model on `snippet_embeds` (live → overridden → live again).
 * An override is a document-local copy (`override_blocks`) that detaches the embed
 * from its live source; accepting the source clears it. The columns are
 * editor-write, so a viewer's override update touches zero rows under RLS.
 */
describe('snippet embed override / accept-source (R.3)', () => {
  const override = [{ type: 'divider' }];

  async function freshEmbed(): Promise<{ blockId: string; tmpItem: string }> {
    const tmpItem = (
      await owner`
        insert into public.library_items (workspace_id, name, type, blocks, created_by)
        values (${ws}, 'Override src', 'snippet', ${owner.json([snippetParagraph])}, ${ownerId}) returning id
      `
    )[0]!.id as string;
    const blockId = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, snippet_id, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'snippet', 20, 'snippet', ${tmpItem},
                ${owner.json({ type: 'snippet', snippet_id: tmpItem, snippet_name: 'Override src' })}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    await owner`
      insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id, state)
      values (${ws}, ${documentId}, ${blockId}, ${tmpItem}, 'live')
    `;
    return { blockId, tmpItem };
  }

  it('the owner can override an embed and then accept the source again', async () => {
    const { blockId, tmpItem } = await freshEmbed();

    // Override: detach from the live source, freezing this doc's copy.
    await owner`
      update public.snippet_embeds
      set state = 'overridden',
          override_blocks = ${owner.json(override)},
          override_created_at = now(),
          override_created_by = ${ownerId}
      where block_id = ${blockId}
    `;
    const overridden = (
      await owner`select state, override_blocks from public.snippet_embeds where block_id = ${blockId}`
    )[0]!;
    expect(overridden.state).toBe('overridden');
    const stored =
      typeof overridden.override_blocks === 'string'
        ? JSON.parse(overridden.override_blocks)
        : overridden.override_blocks;
    expect(stored).toEqual(override);

    // Accept source: drop the override, follow the live snippet again.
    await owner`
      update public.snippet_embeds
      set state = 'live', override_blocks = null, override_created_at = null, override_created_by = null
      where block_id = ${blockId}
    `;
    const live = (
      await owner`select state, override_blocks from public.snippet_embeds where block_id = ${blockId}`
    )[0]!;
    expect(live.state).toBe('live');
    expect(live.override_blocks).toBeNull();

    await owner`delete from public.blocks where id = ${blockId}`;
    await owner`delete from public.library_items where id = ${tmpItem}`;
  });

  it("a viewer's override update touches zero rows (RLS), leaving the embed live", async () => {
    const { blockId, tmpItem } = await freshEmbed();

    // RLS UPDATE filtered by `using` affects no rows without raising.
    const touched = await viewer`
      update public.snippet_embeds set state = 'overridden', override_blocks = ${viewer.json(override)}
      where block_id = ${blockId} returning block_id
    `;
    expect(touched).toHaveLength(0);
    const after = (await owner`select state from public.snippet_embeds where block_id = ${blockId}`)[0]!;
    expect(after.state).toBe('live');

    await owner`delete from public.blocks where id = ${blockId}`;
    await owner`delete from public.library_items where id = ${tmpItem}`;
  });
});

/**
 * R.3b — the reactive `source_changed` transition. Re-editing a snippet source
 * flags every **overridden** embed `source_changed` (the override content is kept
 * — it still publishes — but the owner is told the source moved); **live** embeds
 * are untouched (they just follow the new source). "Keep override" re-anchors to
 * the current version and returns to `overridden`. The flip is editor-write.
 */
describe('snippet embed source_changed / keep-override (R.3b)', () => {
  const override = [{ type: 'divider' }];
  let srcItem: string;
  let overriddenBlock: string;
  let liveBlock: string;

  async function placeOverridden(item: string, order: number): Promise<string> {
    const blockId = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, snippet_id, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'snippet', ${order}, 'snippet', ${item},
                ${owner.json({ type: 'snippet', snippet_id: item, snippet_name: 'Src changed' })}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    await owner`
      insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id, state, override_blocks, override_created_at, override_created_by)
      values (${ws}, ${documentId}, ${blockId}, ${item}, 'overridden', ${owner.json(override)}, now(), ${ownerId})
    `;
    return blockId;
  }

  beforeAll(async () => {
    srcItem = (
      await owner`
        insert into public.library_items (workspace_id, name, type, blocks, created_by)
        values (${ws}, 'Src changed', 'snippet', ${owner.json([snippetParagraph])}, ${ownerId}) returning id
      `
    )[0]!.id as string;
    overriddenBlock = await placeOverridden(srcItem, 30);
    // A second, still-live embed on the same snippet — must survive the flip.
    liveBlock = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, snippet_id, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'snippet', 31, 'snippet', ${srcItem},
                ${owner.json({ type: 'snippet', snippet_id: srcItem, snippet_name: 'Src changed' })}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    await owner`
      insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id, state)
      values (${ws}, ${documentId}, ${liveBlock}, ${srcItem}, 'live')
    `;
  });

  afterAll(async () => {
    await owner`delete from public.blocks where id in (${overriddenBlock}, ${liveBlock})`;
    await owner`delete from public.library_items where id = ${srcItem}`;
  });

  it('a source edit flags only the overridden embed, keeping its override content', async () => {
    // Editing the source records a new version (the rollback target).
    await owner`
      insert into public.library_item_versions (workspace_id, library_item_id, blocks_snapshot, change_note, created_by)
      values (${ws}, ${srcItem}, ${owner.json([snippetParagraph, { type: 'divider' }])}, 'Edited', ${ownerId})
    `;
    // The reactive flip: overridden → source_changed, scoped to this snippet.
    const flipped = await owner`
      update public.snippet_embeds set state = 'source_changed', updated_by = ${ownerId}
      where library_item_id = ${srcItem} and state = 'overridden'
      returning block_id, document_id, override_created_by
    `;
    expect(flipped).toHaveLength(1);
    expect(flipped[0]!.block_id).toBe(overriddenBlock);
    expect(flipped[0]!.document_id).toBe(documentId);
    expect(flipped[0]!.override_created_by).toBe(ownerId);

    // The override content is preserved (it still publishes until accept/keep).
    const row = (
      await owner`select state, override_blocks from public.snippet_embeds where block_id = ${overriddenBlock}`
    )[0]!;
    expect(row.state).toBe('source_changed');
    const stored =
      typeof row.override_blocks === 'string' ? JSON.parse(row.override_blocks) : row.override_blocks;
    expect(stored).toEqual(override);

    // The live embed on the same snippet is untouched.
    const live = (await owner`select state from public.snippet_embeds where block_id = ${liveBlock}`)[0]!;
    expect(live.state).toBe('live');
  });

  it('keep-override returns a source_changed embed to overridden and re-anchors the version', async () => {
    const version = (
      await owner`
        select version_id from public.library_item_versions
        where library_item_id = ${srcItem} order by created_at desc limit 1
      `
    )[0]!.version_id as string;
    await owner`
      update public.snippet_embeds
      set state = 'overridden', source_version_at_override = ${version}, updated_by = ${ownerId}
      where block_id = ${overriddenBlock}
    `;
    const row = (
      await owner`select state, source_version_at_override from public.snippet_embeds where block_id = ${overriddenBlock}`
    )[0]!;
    expect(row.state).toBe('overridden');
    expect(row.source_version_at_override).toBe(version);
  });

  it("a viewer cannot flip an embed to source_changed (RLS — zero rows)", async () => {
    const touched = await viewer`
      update public.snippet_embeds set state = 'source_changed'
      where block_id = ${overriddenBlock} returning block_id
    `;
    expect(touched).toHaveLength(0);
    const after = (await owner`select state from public.snippet_embeds where block_id = ${overriddenBlock}`)[0]!;
    expect(after.state).toBe('overridden');
  });
});

/**
 * R.5 — archiving a snippet converts its **live** embeds to static copies (§3.8):
 * each is frozen to the source's current blocks (`override_blocks`, state →
 * overridden) so it keeps its content once the source is archived. Already-
 * overridden embeds keep their own copy. The published snapshot then expands from
 * the frozen copy (state ≠ live + override_blocks), never from the archived source.
 */
describe('archive → static embed conversion (R.5)', () => {
  const sourceBlocks = [
    { type: 'paragraph', content: { alignment: 'left', nodes: [] } },
    { type: 'divider' },
  ];

  it('freezes a live embed to the source blocks, leaving an existing override alone', async () => {
    const item = (
      await owner`
        insert into public.library_items (workspace_id, name, type, blocks, created_by)
        values (${ws}, 'Archive me', 'snippet', ${owner.json(sourceBlocks)}, ${ownerId}) returning id
      `
    )[0]!.id as string;
    const place = async (order: number): Promise<string> =>
      (
        await owner`
          insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, snippet_id, content, created_by)
          values (${ws}, ${documentId}, ${revisionId}, 'snippet', ${order}, 'snippet', ${item},
                  ${owner.json({ type: 'snippet', snippet_id: item, snippet_name: 'Archive me' })}, ${ownerId})
          returning id
        `
      )[0]!.id as string;
    const liveBlock = await place(40);
    await owner`
      insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id, state)
      values (${ws}, ${documentId}, ${liveBlock}, ${item}, 'live')
    `;
    const ovrBlock = await place(41);
    const userOverride = [{ type: 'divider' }];
    await owner`
      insert into public.snippet_embeds (workspace_id, document_id, block_id, library_item_id, state, override_blocks, override_created_by)
      values (${ws}, ${documentId}, ${ovrBlock}, ${item}, 'overridden', ${owner.json(userOverride)}, ${ownerId})
    `;

    // The archive conversion: freeze only the live embeds to the source blocks.
    const frozen = await owner`
      update public.snippet_embeds set state = 'overridden', override_blocks = ${owner.json(sourceBlocks)}, override_created_by = ${ownerId}
      where library_item_id = ${item} and state = 'live'
      returning block_id
    `;
    expect(frozen).toHaveLength(1);
    expect(frozen[0]!.block_id).toBe(liveBlock);

    // The (formerly live) embed now holds a self-contained copy of the source.
    const frozenRow = (
      await owner`select state, override_blocks from public.snippet_embeds where block_id = ${liveBlock}`
    )[0]!;
    expect(frozenRow.state).toBe('overridden');
    const frozenBlocks =
      typeof frozenRow.override_blocks === 'string'
        ? JSON.parse(frozenRow.override_blocks)
        : frozenRow.override_blocks;
    expect(frozenBlocks).toEqual(sourceBlocks);

    // The user's pre-existing override is untouched (its own copy wins).
    const keptRow = (
      await owner`select override_blocks from public.snippet_embeds where block_id = ${ovrBlock}`
    )[0]!;
    const keptBlocks =
      typeof keptRow.override_blocks === 'string'
        ? JSON.parse(keptRow.override_blocks)
        : keptRow.override_blocks;
    expect(keptBlocks).toEqual(userOverride);

    // With every embed frozen, the source can be archived without breaking content.
    await owner`update public.library_items set archived_at = now(), archived_by = ${ownerId} where id = ${item}`;
    expect(
      await owner`select archived_at from public.library_items where id = ${item} and archived_at is not null`,
    ).toHaveLength(1);

    await owner`delete from public.blocks where id in (${liveBlock}, ${ovrBlock})`;
    await owner`delete from public.library_items where id = ${item}`;
  });
});
