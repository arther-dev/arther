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
