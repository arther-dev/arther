import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * G2.6/G2.5 probes — commit_generation (migration 0018). Atomically commits a
 * generation run into a Draft (document + revision + block tree + spec refs
 * resolved to current field versions). Zero-hallucination: a reference to an
 * unknown / cross-workspace or valueless field is rejected and the whole commit
 * rolls back (invariant 6). Service-role only — `admin` (superuser) stands in
 * for the service role; an authenticated client is denied EXECUTE.
 */

let admin: Sql;
let editor: Sql;
let editorId: string;
let ws: string;
let productId: string;
let documentTypeId: string;
let productFieldId: string;
let currentVersionId: string;
let emptyFieldId: string;

const para = (text: string) => ({
  type: 'paragraph',
  content: { alignment: 'left', nodes: [{ type: 'text', text, marks: [] }] },
});

async function makeRun(): Promise<string> {
  const rows = await admin`
    insert into public.generation_runs (workspace_id, product_id, document_type_id, status, requested_by)
    values (${ws}, ${productId}, ${documentTypeId}, 'queued', ${editorId}) returning id
  `;
  return rows[0]!.id as string;
}

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `commit-editor-${run}@example.com`);
  editor = await userClient(editorId);

  ws = (await editor`select public.create_workspace('Commitworks', ${uniqueSlug('cw')}) as id`)[0]!
    .id as string;
  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Servo Drive S2', ${editorId}) returning id
    `
  )[0]!.id as string;
  documentTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  productFieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Rated voltage', 'scalar', 'Electrical', ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`select public.update_spec_field_value(${productFieldId}, ${editor.json({ value: 36, unit_id: null })}, 'v1')`;
  currentVersionId = (
    await editor`select current_version_id from public.spec_fields where id = ${productFieldId}`
  )[0]!.current_version_id as string;

  emptyFieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Unset torque', 'scalar', 'Mechanical', ${editorId}) returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await editor?.end();
  await admin?.end();
});

describe('commit_generation (G2.6/G2.5)', () => {
  it('atomically creates the document, revision, block tree, and resolved spec refs', async () => {
    const runId = await makeRun();
    const blocks = [
      { type: 'paragraph', source: 'manual', content: para('Read this before you begin.') },
      {
        type: 'spec_table',
        source: 'spec',
        content: { type: 'spec_table', product_id: productId },
        spec_refs: [{ field_id: productFieldId }],
      },
    ];
    const documentId = (
      await admin`select public.commit_generation(${runId}, 'Datasheet', ${admin.json(blocks)}) as id`
    )[0]!.id as string;

    const doc = await admin`select title, current_revision_id from public.documents where id = ${documentId}`;
    expect(doc[0]!.title).toBe('Datasheet');
    expect(doc[0]!.current_revision_id).not.toBeNull();

    const rev = await admin`
      select state, revision_number from public.document_revisions where id = ${doc[0]!.current_revision_id}
    `;
    expect(rev[0]!.state).toBe('draft');
    expect(rev[0]!.revision_number).toBe(1);

    const blockRows = await admin`
      select type, display_order from public.blocks where document_id = ${documentId} order by display_order
    `;
    expect(blockRows.map((b) => b.type)).toEqual(['paragraph', 'spec_table']);

    const refs = await admin`
      select field_id, field_version_id, reference_type from public.block_spec_references where document_id = ${documentId}
    `;
    expect(refs).toHaveLength(1);
    expect(refs[0]!.field_id).toBe(productFieldId);
    expect(refs[0]!.field_version_id).toBe(currentVersionId);
    expect(refs[0]!.reference_type).toBe('generated');

    const runRow = await admin`select status, document_id from public.generation_runs where id = ${runId}`;
    expect(runRow[0]!.status).toBe('succeeded');
    expect(runRow[0]!.document_id).toBe(documentId);
  });

  it('rejects a reference to an unknown field and rolls the whole commit back', async () => {
    const runId = await makeRun();
    const blocks = [
      {
        type: 'paragraph',
        source: 'spec',
        content: para('Bad.'),
        spec_refs: [{ field_id: crypto.randomUUID() }],
      },
    ];
    const message = await expectDenied(
      () => admin`select public.commit_generation(${runId}, 'Bad', ${admin.json(blocks)})`,
    );
    expect(message).toMatch(/zero-hallucination|not in this workspace/);
    // Rollback: the run is untouched and no document was created.
    const runRow = await admin`select status, document_id from public.generation_runs where id = ${runId}`;
    expect(runRow[0]!.document_id).toBeNull();
    expect(runRow[0]!.status).toBe('queued');
  });

  it('rejects a reference to a field that has no value', async () => {
    const runId = await makeRun();
    const blocks = [
      { type: 'paragraph', source: 'spec', content: para('Empty.'), spec_refs: [{ field_id: emptyFieldId }] },
    ];
    const message = await expectDenied(
      () => admin`select public.commit_generation(${runId}, 'Empty', ${admin.json(blocks)})`,
    );
    expect(message).toMatch(/has no value/);
  });

  it('refuses to commit the same run twice (idempotent retry guard)', async () => {
    const runId = await makeRun();
    await admin`select public.commit_generation(${runId}, 'Once', ${admin.json([{ type: 'paragraph', source: 'manual', content: para('x') }])})`;
    const message = await expectDenied(
      () => admin`select public.commit_generation(${runId}, 'Twice', ${admin.json([{ type: 'paragraph', source: 'manual', content: para('y') }])})`,
    );
    expect(message).toMatch(/already committed/);
  });

  it('is service-role only — an authenticated client cannot call it', async () => {
    const runId = await makeRun();
    const message = await expectDenied(
      () => editor`select public.commit_generation(${runId}, 'Nope', ${editor.json([])})`,
    );
    expect(message).toMatch(/permission denied/i);
  });
});
