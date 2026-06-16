import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G2.7 probes — `placeholder_brief_references`: generation links a placeholder
 * block (a required-but-empty brief fragment) to its entity + fragment key, so
 * filling that fragment can find the blocks waiting on it (the G7.2 lookup).
 * Validates the write + the (entity, fragment_key) lookup + one-per-block
 * uniqueness + member-read / stranger isolation.
 */

let admin: Sql;
let editor: Sql;
let stranger: Sql;
let ws: string;
let productId: string;
let documentId: string;
let blockId: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  const editorId = await createAuthUser(admin, `ph-editor-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `ph-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Placeholders', ${uniqueSlug('ph')}) as id`)[0]!.id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('phx')})`;

  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Servo Drive S2', ${editorId}) returning id
    `
  )[0]!.id as string;
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
  blockId = (
    await editor`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${ws}, ${documentId}, ${revisionId}, 'callout', 0, 'placeholder', ${editor.json({ type: 'callout', variant: 'important', content: { alignment: 'left', nodes: [] } })}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  await editor`
    insert into public.placeholder_brief_references (workspace_id, block_id, document_id, entity_type, entity_id, fragment_key, section_name)
    values (${ws}, ${blockId}, ${documentId}, 'product', ${productId}, 'overview', 'Overview')
  `;
});

afterAll(async () => {
  await editor?.end();
  await stranger?.end();
  await admin?.end();
});

describe('placeholder_brief_references (G2.7)', () => {
  it('the (entity, fragment_key) lookup finds the waiting block; a stranger sees none', async () => {
    const waiting = await editor`
      select block_id from public.placeholder_brief_references
      where workspace_id = ${ws} and entity_type = 'product' and entity_id = ${productId} and fragment_key = 'overview'
    `;
    expect(waiting.map((r) => r.block_id)).toEqual([blockId]);
    expect(await stranger`select id from public.placeholder_brief_references where workspace_id = ${ws}`).toHaveLength(0);
  });

  it('is one placeholder reference per block', async () => {
    await expectDenied(
      () => editor`
        insert into public.placeholder_brief_references (workspace_id, block_id, document_id, entity_type, entity_id, fragment_key)
        values (${ws}, ${blockId}, ${documentId}, 'product', ${productId}, 'duplicate')
      `,
    );
  });
});
