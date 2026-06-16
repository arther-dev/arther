import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * G6.8 probes — spec coverage. The coverage report counts, per spec field, how
 * many of a product's live (non-archived) documents reference it via
 * `block_spec_references`. This probe validates the data-model semantics the
 * `getSpecCoverageForProduct` helper relies on: distinct-document counting,
 * exclusion of archived documents, and that a field with no reference is a gap.
 * RLS keeps the references workspace-private. (The JS aggregation itself is
 * unit-tested in `@arther/types/spec-coverage.test.ts`.)
 */

let admin: Sql;
let editor: Sql;
let stranger: Sql;
let editorId: string;
let strangerId: string;
let ws: string;
let productId: string;
let componentId: string;
let documentTypeId: string;
let productFieldId: string;
let componentFieldId: string;
let unusedFieldId: string;
let archivedFieldId: string;

const para = (text: string) => ({
  type: 'paragraph',
  content: { alignment: 'left', nodes: [{ type: 'text', text, marks: [] }] },
});

/** Insert a document (optionally archived) with one block, and return both ids. */
async function makeDoc(slug: string, archived: boolean): Promise<{ documentId: string; blockId: string }> {
  const documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by, archived_at)
      values (${ws}, ${productId}, ${documentTypeId}, ${slug}, ${slug}, ${editorId}, ${editorId}, ${archived ? new Date().toISOString() : null})
      returning id
    `
  )[0]!.id as string;
  const revisionId = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`update public.documents set current_revision_id = ${revisionId} where id = ${documentId}`;
  const blockId = (
    await editor`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 0, 'spec', ${editor.json(para('x'))}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  return { documentId, blockId };
}

async function makeField(owner: 'product' | 'component', name: string): Promise<{ id: string; v1: string }> {
  const id = (
    owner === 'product'
      ? await editor`
          insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
          values (${ws}, ${productId}, ${name}, 'scalar', 'Electrical', ${editorId}) returning id
        `
      : await editor`
          insert into public.spec_fields (workspace_id, component_id, name, type, category, created_by)
          values (${ws}, ${componentId}, ${name}, 'scalar', 'Electrical', ${editorId}) returning id
        `
  )[0]!.id as string;
  const v1 = (
    await editor`select public.update_spec_field_value(${id}, ${editor.json({ value: 1, unit_id: null })}, 'v1') as id`
  )[0]!.id as string;
  return { id, v1 };
}

async function addRef(blockId: string, documentId: string, fieldId: string, fieldVersionId: string) {
  await editor`
    insert into public.block_spec_references (workspace_id, block_id, document_id, field_id, field_version_id)
    values (${ws}, ${blockId}, ${documentId}, ${fieldId}, ${fieldVersionId})
  `;
}

const coverage = (sql: Sql) => sql`
  select bsr.field_id, count(distinct bsr.document_id)::int as n
  from public.block_spec_references bsr
  join public.documents d on d.id = bsr.document_id
  where d.product_id = ${productId} and d.archived_at is null
  group by bsr.field_id
`;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `cov-editor-${run}@example.com`);
  strangerId = await createAuthUser(admin, `cov-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Coverworks', ${uniqueSlug('cw')}) as id`)[0]!.id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('cwx')})`;

  productId = (
    await editor`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Servo X', ${editorId}) returning id`
  )[0]!.id as string;
  componentId = (
    await editor`insert into public.components (workspace_id, name, type, created_by) values (${ws}, 'Driver', 'module', ${editorId}) returning id`
  )[0]!.id as string;
  documentTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  const productField = await makeField('product', 'Rated voltage');
  const componentField = await makeField('component', 'Max current');
  const unusedField = await makeField('product', 'Inrush current');
  const archivedField = await makeField('product', 'Legacy spec');
  productFieldId = productField.id;
  componentFieldId = componentField.id;
  unusedFieldId = unusedField.id;
  archivedFieldId = archivedField.id;

  // doc1 (live): references productField AND componentField.
  const doc1 = await makeDoc('guide-1', false);
  await addRef(doc1.blockId, doc1.documentId, productField.id, productField.v1);
  await addRef(doc1.blockId, doc1.documentId, componentField.id, componentField.v1);

  // doc2 (live): two blocks both reference productField — distinct-document count stays 1 for doc2.
  const doc2 = await makeDoc('guide-2', false);
  const doc2BlockB = (
    await editor`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      select ${ws}, ${doc2.documentId}, revision_id, 'paragraph', 1, 'spec', ${editor.json(para('y'))}, ${editorId}
      from public.blocks where id = ${doc2.blockId} returning id
    `
  )[0]!.id as string;
  await addRef(doc2.blockId, doc2.documentId, productField.id, productField.v1);
  await addRef(doc2BlockB, doc2.documentId, productField.id, productField.v1);

  // doc3 (archived): references archivedField — must be excluded from coverage.
  const doc3 = await makeDoc('legacy', true);
  await addRef(doc3.blockId, doc3.documentId, archivedField.id, archivedField.v1);
});

afterAll(async () => {
  await editor?.end();
  await stranger?.end();
  await admin?.end();
});

describe('spec coverage (G6.8)', () => {
  it('counts distinct live documents per field', async () => {
    const rows = await coverage(editor);
    const byField = new Map(rows.map((r) => [r.field_id as string, r.n as number]));
    expect(byField.get(productFieldId)).toBe(2); // doc1 + doc2 (deduped across doc2's two blocks)
    expect(byField.get(componentFieldId)).toBe(1); // doc1 only
  });

  it('omits a field referenced by no live document', async () => {
    const rows = await coverage(editor);
    const fields = new Set(rows.map((r) => r.field_id as string));
    expect(fields.has(unusedFieldId)).toBe(false);
    expect(fields.has(archivedFieldId)).toBe(false); // only an archived doc references it
  });

  it('keeps references workspace-private (a stranger sees none)', async () => {
    const rows = await coverage(stranger);
    expect(rows).toHaveLength(0);
  });
});
