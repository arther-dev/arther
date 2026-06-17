import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, expectDenied, uniqueSlug, userClient } from './helpers';

/**
 * C2 probes — block-anchored comment threads (collaboration spec §7; schema in
 * 0007). Under test:
 *   - C2.1: commenting is a spec'd VIEWER right (member RLS, not editor); a
 *           non-member is denied; replies nest under a thread;
 *   - C2.2: a thread resolves and reopens (status transitions);
 *   - threading: deleting a thread cascades to its comments;
 *   - C2.3 (schema): deleting the anchored block nulls `block_id` (orphan-by-delete).
 */

let admin: Sql;
let owner: Sql;
let member: Sql;
let viewer: Sql;
let stranger: Sql;
let ownerId: string;
let memberId: string;
let viewerId: string;
let strangerId: string;
let ws: string;
let revisionId: string;
let blockId: string;

const paragraph = { type: 'paragraph', content: { alignment: 'left', nodes: [] } };

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `cm-owner-${run}@example.com`);
  memberId = await createAuthUser(admin, `cm-member-${run}@example.com`);
  viewerId = await createAuthUser(admin, `cm-viewer-${run}@example.com`);
  strangerId = await createAuthUser(admin, `cm-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  member = await userClient(memberId);
  viewer = await userClient(viewerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Comment Co', ${uniqueSlug('cmt')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${memberId}, 'member', ${ownerId}), (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;

  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Widget', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  const documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Widget Guide', 'widget', ${ownerId}, ${ownerId})
      returning id
    `
  )[0]!.id as string;
  revisionId = (
    await owner`
      insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
      values (${ws}, ${documentId}, 1, 'draft', ${ownerId}) returning id
    `
  )[0]!.id as string;
  blockId = (
    await owner`
      insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
      values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 1, 'manual', ${owner.json(paragraph)}, ${ownerId})
      returning id
    `
  )[0]!.id as string;
});

afterAll(async () => {
  await owner?.end();
  await member?.end();
  await viewer?.end();
  await stranger?.end();
  await admin?.end();
});

async function newThread(client: Sql, by: string): Promise<string> {
  const id = (
    await client`
      insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, created_by)
      values (${ws}, ${revisionId}, ${blockId}, 'block', ${by}) returning id
    `
  )[0]!.id as string;
  await client`
    insert into public.comments (workspace_id, thread_id, author_id, body)
    values (${ws}, ${id}, ${by}, 'first comment')
  `;
  return id;
}

describe('commenting is a member right (C2.1)', () => {
  it('a viewer can open a thread and comment (spec viewer right)', async () => {
    const threadId = await newThread(viewer, viewerId);
    const comments = await admin`select id from public.comments where thread_id = ${threadId}`;
    expect(comments).toHaveLength(1);
  });

  it('a non-member cannot open a thread (RLS: members only)', async () => {
    await expectDenied(
      () => stranger`
        insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, created_by)
        values (${ws}, ${revisionId}, ${blockId}, 'block', ${strangerId})
      `,
    );
  });

  it('a reply nests under the thread root', async () => {
    const threadId = await newThread(member, memberId);
    const root = (
      await admin`select id from public.comments where thread_id = ${threadId} and parent_comment_id is null`
    )[0]!.id as string;
    await member`
      insert into public.comments (workspace_id, thread_id, parent_comment_id, author_id, body)
      values (${ws}, ${threadId}, ${root}, ${memberId}, 'a reply')
    `;
    const all = await admin`select id from public.comments where thread_id = ${threadId}`;
    expect(all).toHaveLength(2);
  });
});

describe('resolve / reopen (C2.2)', () => {
  it('an open thread resolves and reopens', async () => {
    const threadId = await newThread(member, memberId);
    await member`
      update public.comment_threads set status = 'resolved', resolved_by = ${memberId}, resolved_at = now()
      where id = ${threadId} and status = 'open'
    `;
    expect(
      (await admin`select status from public.comment_threads where id = ${threadId}`)[0]!.status,
    ).toBe('resolved');

    await member`
      update public.comment_threads set status = 'open', resolved_by = null, resolved_at = null
      where id = ${threadId} and status = 'resolved'
    `;
    expect(
      (await admin`select status from public.comment_threads where id = ${threadId}`)[0]!.status,
    ).toBe('open');
  });
});

describe('threading + orphaning schema', () => {
  it('deleting a thread cascades to its comments', async () => {
    const threadId = await newThread(member, memberId);
    await member`delete from public.comment_threads where id = ${threadId}`;
    expect(await admin`select id from public.comments where thread_id = ${threadId}`).toHaveLength(0);
  });

  it('C2.3 — deleting the anchored block nulls block_id (orphan-by-delete)', async () => {
    // A dedicated block so the shared fixture block stays intact for other tests.
    const tmpBlock = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${ws}, (select document_id from public.document_revisions where id = ${revisionId}), ${revisionId}, 'paragraph', 9, 'manual', ${owner.json(paragraph)}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    const threadId = (
      await owner`
        insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, created_by)
        values (${ws}, ${revisionId}, ${tmpBlock}, 'block', ${ownerId}) returning id
      `
    )[0]!.id as string;

    await owner`delete from public.blocks where id = ${tmpBlock}`;
    const row = (
      await admin`select block_id from public.comment_threads where id = ${threadId}`
    )[0]!;
    expect(row.block_id).toBeNull();
  });
});
