import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * G7.3 spine probes — `block_brief_references`: the brief analog of the spec
 * staleness anchor. Generation captures the fragment's `content_snapshot` per
 * brief-sourced block; editing the fragment makes the snapshot differ from the
 * current content, which the brief-staleness read detects. Validates the write,
 * the staleness comparison, and member-read / stranger isolation.
 */

let admin: Sql;
let editor: Sql;
let stranger: Sql;
let ws: string;
let briefId: string;
let documentId: string;

const staleCount = async (sql: Sql): Promise<number> =>
  (
    await sql`
      select count(*)::int as n
      from public.block_brief_references r
      join public.brief_fragments f on f.brief_id = r.brief_id and f.key = r.fragment_key
      where r.document_id = ${documentId} and r.content_snapshot <> f.content
    `
  )[0]!.n as number;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  const editorId = await createAuthUser(admin, `bs-editor-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `bs-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Briefworks', ${uniqueSlug('bs')}) as id`)[0]!.id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('bsx')})`;

  const productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Servo Drive S2', ${editorId}) returning id
    `
  )[0]!.id as string;
  briefId = (
    await editor`
      insert into public.product_briefs (workspace_id, entity_type, entity_id, created_by)
      values (${ws}, 'product', ${productId}, ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`
    insert into public.brief_fragments (workspace_id, brief_id, key, content, updated_by)
    values (${ws}, ${briefId}, 'overview', 'original copy', ${editorId})
  `;

  const documentTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${documentTypeId}, 'Guide', 'guide', ${editorId}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  const revisionId = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${editorId}) returning id
    `
  )[0]!.id as string;
  const blockId = (
    await editor`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 0, 'brief', ${editor.json({ type: 'paragraph', content: { alignment: 'left', nodes: [] } })}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  // The spine's write: a block→brief reference with the fragment's content snapshot.
  await editor`
    insert into public.block_brief_references (workspace_id, block_id, document_id, brief_id, fragment_key, content_snapshot)
    values (${ws}, ${blockId}, ${documentId}, ${briefId}, 'overview', 'original copy')
  `;
});

afterAll(async () => {
  await editor?.end();
  await stranger?.end();
  await admin?.end();
});

describe('block_brief_references staleness (G7.3 spine)', () => {
  it('a member reads the reference; a stranger sees none', async () => {
    expect(await editor`select id from public.block_brief_references where document_id = ${documentId}`).toHaveLength(1);
    expect(await stranger`select id from public.block_brief_references where workspace_id = ${ws}`).toHaveLength(0);
  });

  it('snapshot matches current content → not stale; editing the fragment → stale', async () => {
    expect(await staleCount(editor)).toBe(0);
    await editor`update public.brief_fragments set content = 'edited copy' where brief_id = ${briefId} and key = 'overview'`;
    expect(await staleCount(editor)).toBe(1);
  });
});
