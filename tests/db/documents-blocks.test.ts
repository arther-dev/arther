import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G3 probes — Documents & Blocks (migration 0005). The persistence spine: a
 * document with a draft revision, the block tree (top-level rows; container
 * interiors inline in `content`), the three reference tables, the staleness
 * join, and the archive guards extended in 0005. Members READ, editors WRITE;
 * generation_runs are service-role-only (no client insert). Strangers see
 * nothing.
 */

let admin: Sql;
let editor: Sql;
let viewer: Sql;
let stranger: Sql;
let editorId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let productId: string;
let componentId: string;
let documentTypeId: string;
let productBriefId: string;
let documentId: string;
let revisionId: string;
let blockIds: string[] = [];
let productFieldId: string;
let productFieldV1: string;
let componentFieldId: string;
let componentFieldV1: string;

const asJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
const para = (text: string) => ({
  type: 'paragraph',
  content: { alignment: 'left', nodes: [{ type: 'text', text, marks: [] }] },
});

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `doc-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `doc-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `doc-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Docworks', ${uniqueSlug('dw')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('dwx')})`;

  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Servo Drive S2', ${editorId}) returning id
    `
  )[0]!.id as string;
  componentId = (
    await editor`
      insert into public.components (workspace_id, name, type, created_by)
      values (${ws}, 'Motor Controller', 'module', ${editorId}) returning id
    `
  )[0]!.id as string;
  // A built-in Document Type (workspace_id null) is globally readable and a valid
  // documents.document_type_id (0004 seed).
  documentTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  productBriefId = (
    await editor`
      insert into public.product_briefs (workspace_id, entity_type, entity_id, created_by)
      values (${ws}, 'product', ${productId}, ${editorId}) returning id
    `
  )[0]!.id as string;

  // A document with its first draft revision; wire the current pointer.
  documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${documentTypeId}, 'Installation Guide', 'guide', ${editorId}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  revisionId = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`update public.documents set current_revision_id = ${revisionId} where id = ${documentId}`;

  // Three top-level blocks; block 1 is an accordion whose children live inline.
  const accordion = {
    type: 'accordion',
    sections: [
      {
        id: 's1',
        title: 'Setup',
        display_order: 0,
        default_open: true,
        children: [para('Mount the drive on the DIN rail.')],
      },
    ],
  };
  const contents = [para('Read this before you begin.'), accordion, { type: 'spec_table', product_id: productId }];
  const types = ['paragraph', 'accordion', 'spec_table'];
  const sources = ['manual', 'manual', 'spec'];
  blockIds = [];
  for (let i = 0; i < contents.length; i += 1) {
    const id = (
      await editor`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, ${types[i]!}, ${i}, ${sources[i]!}, ${editor.json(contents[i]!)}, ${editorId})
        returning id
      `
    )[0]!.id as string;
    blockIds.push(id);
  }

  // Two versioned fields (one product-owned, one component-owned) referenced by blocks.
  productFieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Rated voltage', 'scalar', 'Electrical', ${editorId}) returning id
    `
  )[0]!.id as string;
  productFieldV1 = (
    await editor`select public.update_spec_field_value(${productFieldId}, ${editor.json({ value: 36, unit_id: null })}, 'v1') as id`
  )[0]!.id as string;
  componentFieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, component_id, name, type, category, created_by)
      values (${ws}, ${componentId}, 'Max current', 'scalar', 'Electrical', ${editorId}) returning id
    `
  )[0]!.id as string;
  componentFieldV1 = (
    await editor`select public.update_spec_field_value(${componentFieldId}, ${editor.json({ value: 5, unit_id: null })}, 'v1') as id`
  )[0]!.id as string;

  await editor`
    insert into public.block_spec_references (workspace_id, block_id, document_id, field_id, field_version_id)
    values (${ws}, ${blockIds[0]!}, ${documentId}, ${productFieldId}, ${productFieldV1})
  `;
  await editor`
    insert into public.block_spec_references (workspace_id, block_id, document_id, field_id, field_version_id)
    values (${ws}, ${blockIds[1]!}, ${documentId}, ${componentFieldId}, ${componentFieldV1})
  `;
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

describe('documents & blocks (G3)', () => {
  it('wires the document to its first draft revision', async () => {
    const doc = await editor`
      select current_revision_id from public.documents where id = ${documentId}
    `;
    expect(doc[0]!.current_revision_id).toBe(revisionId);
    const rev = await editor`select state, revision_number from public.document_revisions where id = ${revisionId}`;
    expect(rev[0]!.state).toBe('draft');
    expect(rev[0]!.revision_number).toBe(1);
  });

  it('round-trips the block tree in display order with nested content intact', async () => {
    const blocks = await editor`
      select type, display_order, content from public.blocks
      where revision_id = ${revisionId} order by display_order
    `;
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'accordion', 'spec_table']);
    const accordion = asJson(blocks[1]!.content);
    expect(accordion.sections[0].children[0].type).toBe('paragraph');
    expect(accordion.sections[0].children[0].content.nodes[0].text).toBe('Mount the drive on the DIN rail.');
  });

  it('the generated text_search column derives from text_content', async () => {
    await editor`update public.blocks set text_content = 'before you begin' where id = ${blockIds[0]!}`;
    const hit = await editor`
      select id from public.blocks
      where revision_id = ${revisionId} and text_search @@ to_tsquery('english', 'begin')
    `;
    expect(hit.map((r) => r.id)).toContain(blockIds[0]);
  });

  it('persists brief and placeholder references (one per block)', async () => {
    await editor`
      insert into public.block_brief_references (workspace_id, block_id, document_id, brief_id, fragment_key, content_snapshot)
      values (${ws}, ${blockIds[2]!}, ${documentId}, ${productBriefId}, 'overview', 'A precision servo.')
    `;
    await editor`
      insert into public.placeholder_brief_references (workspace_id, block_id, document_id, entity_type, entity_id, fragment_key, section_name)
      values (${ws}, ${blockIds[0]!}, ${documentId}, 'product', ${productId}, 'safety_context', 'Safety')
    `;
    const bbr = await editor`select fragment_key from public.block_brief_references where block_id = ${blockIds[2]!}`;
    expect(bbr[0]!.fragment_key).toBe('overview');
    // Both reference tables are unique per block — a second brief ref is rejected.
    await expectDenied(
      () => editor`
        insert into public.block_brief_references (workspace_id, block_id, document_id, brief_id, fragment_key)
        values (${ws}, ${blockIds[2]!}, ${documentId}, ${productBriefId}, 'safety_context')
      `,
    );
  });
});

describe('staleness join (G3 acceptance)', () => {
  const staleSql = (sql: Sql) => sql`
    select bsr.id, bsr.block_id from public.block_spec_references bsr
    join public.spec_fields f on f.id = bsr.field_id
    where bsr.field_version_id <> f.current_version_id and bsr.document_id = ${documentId}
  `;

  it('returns nothing while every reference anchors the current version', async () => {
    expect(await staleSql(editor)).toHaveLength(0);
  });

  it('returns the affected block once the field advances a version', async () => {
    await editor`select public.update_spec_field_value(${productFieldId}, ${editor.json({ value: 48, unit_id: null })}, 'v2')`;
    const stale = await staleSql(editor);
    expect(stale.map((r) => r.block_id)).toEqual([blockIds[0]]);
  });
});

describe('archive guards extended to block references (G3.4)', () => {
  it('blocks hard-deleting a field referenced by a document block', async () => {
    const message = await expectDenied(
      () => editor`delete from public.spec_fields where id = ${productFieldId}`,
    );
    expect(message).toMatch(/document blocks/);
  });

  it('blocks hard-deleting a component whose field a document block references', async () => {
    const message = await expectDenied(
      () => editor`delete from public.components where id = ${componentId}`,
    );
    expect(message).toMatch(/document blocks/);
  });
});

describe('RLS — members read, editors write, strangers isolated', () => {
  it('a viewer reads blocks but cannot insert one', async () => {
    const read = await viewer`select id from public.blocks where revision_id = ${revisionId}`;
    expect(read.length).toBeGreaterThan(0);
    await expectDenied(
      () => viewer`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 9, 'manual', ${viewer.json(para('sneaky'))}, ${viewerId})
      `,
    );
  });

  it('a stranger sees no documents and cannot insert a block', async () => {
    const rows = await stranger`select id from public.documents where id = ${documentId}`;
    expect(rows).toHaveLength(0);
    await expectDenied(
      () => stranger`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 9, 'manual', ${stranger.json(para('hi'))}, ${strangerId})
      `,
    );
  });

  it('generation_runs are service-role-only — an editor cannot insert one', async () => {
    await expectDenied(
      () => editor`
        insert into public.generation_runs (workspace_id, product_id, document_type_id, requested_by)
        values (${ws}, ${productId}, ${documentTypeId}, ${editorId})
      `,
    );
  });
});
