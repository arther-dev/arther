import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * G8.4 — realistic-volume test. A 120-block document with a spec reference on
 * every block: the block-tree load and the staleness join (the indexed
 * `block_spec_references.field_version_id <> spec_fields.current_version_id`
 * query the editor + dashboard read) stay correct and complete at volume. A
 * single field bump flips every reference stale — the staleness index covers it.
 */

const N_BLOCKS = 120;

let admin: Sql;
let editor: Sql;
let editorId: string;
let ws: string;
let documentId: string;
let revisionId: string;
let fieldId: string;

const para = { type: 'paragraph', content: { alignment: 'left', nodes: [] } };

const staleCount = async (sql: Sql): Promise<number> =>
  (
    await sql`
      select count(*)::int as n
      from public.block_spec_references r
      join public.spec_fields f on f.id = r.field_id
      where r.document_id = ${documentId} and r.field_version_id <> f.current_version_id
    `
  )[0]!.n as number;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `vol-editor-${run}@example.com`);
  editor = await userClient(editorId);

  ws = (await editor`select public.create_workspace('Volume', ${uniqueSlug('vol')}) as id`)[0]!.id as string;
  const productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Big Manual Product', ${editorId}) returning id
    `
  )[0]!.id as string;
  fieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Rated voltage', 'scalar', 'Electrical', ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`select public.update_spec_field_value(${fieldId}, ${editor.json({ value: 36, unit_id: null })}, 'v1')`;

  const documentTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${documentTypeId}, 'Big Manual', 'big-manual', ${editorId}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  revisionId = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${editorId}) returning id
    `
  )[0]!.id as string;

  // 120 blocks in one statement, then a reference on every block.
  await editor`
    insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
    select ${ws}, ${documentId}, ${revisionId}, 'paragraph', g, 'manual', ${editor.json(para)}, ${editorId}
    from generate_series(0, ${N_BLOCKS - 1}) as g
  `;
  const fieldV1 = (
    await editor`select current_version_id as id from public.spec_fields where id = ${fieldId}`
  )[0]!.id as string;
  await editor`
    insert into public.block_spec_references (workspace_id, block_id, document_id, field_id, field_version_id)
    select ${ws}, b.id, ${documentId}, ${fieldId}, ${fieldV1}
    from public.blocks b where b.revision_id = ${revisionId}
  `;
}, 30000);

afterAll(async () => {
  await editor?.end();
  await admin?.end();
});

describe('realistic-volume document (G8.4)', () => {
  it('loads the full ordered block tree at volume', async () => {
    const rows = await editor`
      select display_order from public.blocks where revision_id = ${revisionId} order by display_order asc
    `;
    expect(rows).toHaveLength(N_BLOCKS);
    expect(rows.map((r) => r.display_order)).toEqual([...Array(N_BLOCKS).keys()]);
  });

  it('the staleness join is correct + complete: 0 stale, then all stale after one field bump', async () => {
    expect(await staleCount(editor)).toBe(0); // every reference is at the current version
    await editor`select public.update_spec_field_value(${fieldId}, ${editor.json({ value: 48, unit_id: null })}, 'v2')`;
    expect(await staleCount(editor)).toBe(N_BLOCKS); // one bump flips all 120 references stale
  });
});
