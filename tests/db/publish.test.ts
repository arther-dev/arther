import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * C4 probes — the publish pipeline `publish_document` (migration 0021) over the
 * frozen `published_snapshots` (0008). It atomically freezes an APPROVED revision
 * into a versioned, immutable snapshot and flips the revision to Published.
 * Service-role only (a JWT client can't forge a publication); content is frozen
 * by the 0008 guard; a later spec change never alters a published snapshot;
 * versions are monotonic per document; members read, strangers are isolated.
 */

let admin: Sql;
let editor: Sql;
let viewer: Sql;
let stranger: Sql;
let editorId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let documentId: string;
let rev1: string;
let fieldId: string;

const blockTree = [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }];

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `pub-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `pub-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `pub-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Publish Co', ${uniqueSlug('pub')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('pubx')})`;

  const productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Relay R1', ${editorId}) returning id
    `
  )[0]!.id as string;
  const docTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Relay Datasheet', 'relay', ${editorId}, ${editorId})
      returning id
    `
  )[0]!.id as string;
  rev1 = (
    await editor`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'approved', ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`update public.documents set current_revision_id = ${rev1} where id = ${documentId}`;

  fieldId = (
    await editor`
      insert into public.spec_fields (workspace_id, product_id, name, type, category, created_by)
      values (${ws}, ${productId}, 'Coil voltage', 'scalar', 'Electrical', ${editorId}) returning id
    `
  )[0]!.id as string;
  await editor`select public.update_spec_field_value(${fieldId}, ${editor.json({ value: 24, unit_id: null })}, 'v1')`;
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

describe('publish_document (C4.3/C4.4)', () => {
  it('is service-role only — an authenticated client cannot publish', async () => {
    await expectDenied(
      () => editor`
        select public.publish_document(${rev1}, ${editorId}, ${editor.json(blockTree)}, '{}'::jsonb, 'x')
      `,
    );
  });

  it('freezes an approved revision into a v1.0 snapshot and flips the state', async () => {
    const manifest = { [fieldId]: { name: 'Coil voltage', value: '24 V' } };
    const snapId = (
      await admin`
        select public.publish_document(${rev1}, ${editorId}, ${admin.json(blockTree)}, ${admin.json(manifest)}, 'coil voltage 24 v') as id
      `
    )[0]!.id as string;
    expect(snapId).toBeTruthy();

    const snap = await admin`select version, pdf_ready, block_tree from public.published_snapshots where id = ${snapId}`;
    expect(snap[0]!.version).toBe('1.0');
    expect(snap[0]!.pdf_ready).toBe(false);

    const rev = await admin`select state, published_by from public.document_revisions where id = ${rev1}`;
    expect(rev[0]!.state).toBe('published');
    expect(rev[0]!.published_by).toBe(editorId);
  });

  it('refuses to publish a revision that is not approved', async () => {
    // rev1 is now 'published'; publishing again must fail the approved guard.
    const msg = await expectDenied(
      () => admin`select public.publish_document(${rev1}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'x')`,
    );
    expect(msg).toMatch(/approved/i);
  });

  it('versions are monotonic per document (next publish is 2.0)', async () => {
    const rev2 = (
      await editor`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
        values (${ws}, ${documentId}, 2, 'approved', ${editorId}) returning id
      `
    )[0]!.id as string;
    const snapId = (
      await admin`select public.publish_document(${rev2}, ${editorId}, ${admin.json(blockTree)}, '{}'::jsonb, 'x') as id`
    )[0]!.id as string;
    const snap = await admin`select version from public.published_snapshots where id = ${snapId}`;
    expect(snap[0]!.version).toBe('2.0');
  });
});

describe('immutability + isolation (C4 acceptance)', () => {
  it('content is frozen — a later spec change never alters the snapshot', async () => {
    const before = (
      await admin`select resolution_manifest from public.published_snapshots where document_id = ${documentId} and version = '1.0'`
    )[0]!.resolution_manifest;
    const beforeJson = typeof before === 'string' ? JSON.parse(before) : before;
    expect(beforeJson[fieldId].value).toBe('24 V');

    // Bump the spec field; the frozen snapshot must not change.
    await editor`select public.update_spec_field_value(${fieldId}, ${editor.json({ value: 48, unit_id: null })}, 'v2')`;
    const after = (
      await admin`select resolution_manifest from public.published_snapshots where document_id = ${documentId} and version = '1.0'`
    )[0]!.resolution_manifest;
    const afterJson = typeof after === 'string' ? JSON.parse(after) : after;
    expect(afterJson[fieldId].value).toBe('24 V'); // unchanged
  });

  it('the freeze guard rejects mutating snapshot content', async () => {
    const msg = await expectDenied(
      () => admin`
        update public.published_snapshots set block_tree = '[]'::jsonb where document_id = ${documentId} and version = '1.0'
      `,
    );
    expect(msg).toMatch(/frozen/i);
  });

  it('members read snapshots; strangers see none', async () => {
    const seen = await viewer`select id from public.published_snapshots where document_id = ${documentId}`;
    expect(seen.length).toBeGreaterThan(0);
    const hidden = await stranger`select id from public.published_snapshots where document_id = ${documentId}`;
    expect(hidden).toHaveLength(0);
  });
});
