import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * C0 probes — the document lifecycle state machine over `document_revisions`
 * (migration 0005). The transition is a guarded conditional UPDATE keyed on the
 * current state (the optimistic-lock pattern): it fires only from the expected
 * `from` state, so a concurrent transition can't double-apply. `document_revisions`
 * is member-read / editor-write — a viewer or stranger cannot move the state.
 * Revision numbers are unique per document (the C0.2 working-copy invariant).
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
let documentTypeId: string;
let documentId: string;
let revisionId: string;

const stateOf = async (sql: Sql, id: string) =>
  (await sql`select state from public.document_revisions where id = ${id}`)[0]?.state as
    | string
    | undefined;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  editorId = await createAuthUser(admin, `lc-editor-${run}@example.com`);
  viewerId = await createAuthUser(admin, `lc-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `lc-stranger-${run}@example.com`);
  editor = await userClient(editorId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await editor`select public.create_workspace('Lifecycle Co', ${uniqueSlug('lc')}) as id`)[0]!
    .id as string;
  await editor`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${editorId})
  `;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('lcx')})`;

  productId = (
    await editor`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Gateway G9', ${editorId}) returning id
    `
  )[0]!.id as string;
  documentTypeId = (
    await editor`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  documentId = (
    await editor`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${documentTypeId}, 'Datasheet', 'datasheet', ${editorId}, ${editorId})
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
});

afterAll(async () => {
  await editor?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

describe('lifecycle transitions (C0.1)', () => {
  it('advances draft → review only from the expected state (the conditional guard)', async () => {
    const ok = await editor`
      update public.document_revisions set state = 'review', updated_by = ${editorId}
      where id = ${revisionId} and state = 'draft' returning id
    `;
    expect(ok).toHaveLength(1);
    expect(await stateOf(editor, revisionId)).toBe('review');
  });

  it('a transition keyed on a stale from-state updates nothing (no double-fire)', async () => {
    // The revision is already in 'review'; a second draft-keyed transition no-ops.
    const stale = await editor`
      update public.document_revisions set state = 'approved'
      where id = ${revisionId} and state = 'draft' returning id
    `;
    expect(stale).toHaveLength(0);
    expect(await stateOf(editor, revisionId)).toBe('review');
  });

  it('review → approved, then approved → published stamps the publish metadata', async () => {
    const approved = await editor`
      update public.document_revisions set state = 'approved', updated_by = ${editorId}
      where id = ${revisionId} and state = 'review' returning id
    `;
    expect(approved).toHaveLength(1);

    const published = await editor`
      update public.document_revisions
      set state = 'published', published_at = now(), published_by = ${editorId}, updated_by = ${editorId}
      where id = ${revisionId} and state = 'approved' returning id
    `;
    expect(published).toHaveLength(1);

    const row = await editor`
      select state, published_at, published_by from public.document_revisions where id = ${revisionId}
    `;
    expect(row[0]!.state).toBe('published');
    expect(row[0]!.published_at).not.toBeNull();
    expect(row[0]!.published_by).toBe(editorId);
  });
});

describe('revision numbering (C0.2 working copy)', () => {
  it('rejects a duplicate revision_number for the same document', async () => {
    await expectDenied(
      () => editor`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
        values (${ws}, ${documentId}, 1, 'draft', ${editorId})
      `,
    );
  });

  it('accepts the next revision_number and lets the current pointer move to it', async () => {
    const rev2 = (
      await editor`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
        values (${ws}, ${documentId}, 2, 'draft', ${editorId}) returning id
      `
    )[0]!.id as string;
    await editor`update public.documents set current_revision_id = ${rev2} where id = ${documentId}`;
    const doc = await editor`select current_revision_id from public.documents where id = ${documentId}`;
    expect(doc[0]!.current_revision_id).toBe(rev2);
    // The previously published revision is retained (history is never rewritten).
    expect(await stateOf(editor, revisionId)).toBe('published');
  });
});

describe('RLS — editors transition, viewers and strangers cannot', () => {
  it('a viewer reads the revision but cannot change its state', async () => {
    const read = await viewer`select state from public.document_revisions where id = ${revisionId}`;
    expect(read).toHaveLength(1);
    const before = await stateOf(editor, revisionId);
    const blocked = await viewer`
      update public.document_revisions set state = 'draft' where id = ${revisionId} returning id
    `;
    expect(blocked).toHaveLength(0); // editor-gated write → no row visible to update
    expect(await stateOf(editor, revisionId)).toBe(before);
  });

  it('a stranger sees no revision and cannot change it', async () => {
    const seen = await stranger`select id from public.document_revisions where id = ${revisionId}`;
    expect(seen).toHaveLength(0);
    const before = await stateOf(editor, revisionId);
    const blocked = await stranger`
      update public.document_revisions set state = 'draft' where id = ${revisionId} returning id
    `;
    expect(blocked).toHaveLength(0);
    expect(await stateOf(editor, revisionId)).toBe(before);
  });
});
