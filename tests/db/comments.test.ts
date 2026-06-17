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
let documentId: string;
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
  documentId = (
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

describe('threading cascade', () => {
  it('deleting a thread cascades to its comments', async () => {
    const threadId = await newThread(member, memberId);
    await member`delete from public.comment_threads where id = ${threadId}`;
    expect(await admin`select id from public.comments where thread_id = ${threadId}`).toHaveLength(0);
  });
});

describe('orphaning (C2.3)', () => {
  // orphanBlockThreads is TS (called from applyBlockRegeneration / deleteBlock);
  // these validate the schema contract + semantics it relies on.
  async function blockWithThreads(): Promise<{ block: string; open: string; resolved: string }> {
    const block = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${ws}, ${documentId}, ${revisionId}, 'paragraph', 9, 'manual', ${owner.json(paragraph)}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    const open = (
      await owner`
        insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, created_by)
        values (${ws}, ${revisionId}, ${block}, 'block', ${ownerId}) returning id
      `
    )[0]!.id as string;
    const resolved = (
      await owner`
        insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, status, created_by, resolved_by, resolved_at)
        values (${ws}, ${revisionId}, ${block}, 'block', 'resolved', ${ownerId}, ${ownerId}, now()) returning id
      `
    )[0]!.id as string;
    return { block, open, resolved };
  }

  it('regeneration orphans a block’s OPEN threads (reason block_regenerated); resolved untouched', async () => {
    const { block, open, resolved } = await blockWithThreads();
    // What orphanBlockThreads(block, 'block_regenerated') does:
    await owner`
      update public.comment_threads set status = 'orphaned', orphaned_reason = 'block_regenerated'
      where block_id = ${block} and status = 'open'
    `;
    const openRow = (await admin`select status, orphaned_reason from public.comment_threads where id = ${open}`)[0]!;
    expect(openRow.status).toBe('orphaned');
    expect(openRow.orphaned_reason).toBe('block_regenerated');
    expect(
      (await admin`select status from public.comment_threads where id = ${resolved}`)[0]!.status,
    ).toBe('resolved');
  });

  it('orphaned_reason rejects an unknown value (CHECK)', async () => {
    const { open } = await blockWithThreads();
    await expectDenied(
      () => owner`update public.comment_threads set status = 'orphaned', orphaned_reason = 'bogus' where id = ${open}`,
    );
  });

  it('deleting the anchored block orphans its open threads and nulls block_id', async () => {
    const { block, open } = await blockWithThreads();
    // deleteBlock orphans first, then deletes (the FK then nulls block_id).
    await owner`update public.comment_threads set status = 'orphaned' where block_id = ${block} and status = 'open'`;
    await owner`delete from public.blocks where id = ${block}`;
    const row = (await admin`select status, block_id from public.comment_threads where id = ${open}`)[0]!;
    expect(row.status).toBe('orphaned');
    expect(row.block_id).toBeNull();
  });
});

describe('carry-forward (C2.4)', () => {
  // The carry-forward orchestration lives in TS (createDocumentRevision); this
  // validates the migration 0022 schema contract it relies on — the inherited
  // marker column, its FK behaviour, and the open-only / block-remap semantics.
  it('carries unresolved threads onto a new revision, remapped + flagged inherited', async () => {
    const rev1 = (
      await owner`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
        values (${ws}, ${documentId}, 100, 'published', ${ownerId}) returning id
      `
    )[0]!.id as string;
    const blk1 = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${ws}, ${documentId}, ${rev1}, 'paragraph', 1, 'manual', ${owner.json(paragraph)}, ${ownerId})
        returning id
      `
    )[0]!.id as string;
    const tOpen = await (async () => {
      const id = (
        await owner`
          insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, created_by)
          values (${ws}, ${rev1}, ${blk1}, 'block', ${ownerId}) returning id
        `
      )[0]!.id as string;
      await owner`insert into public.comments (workspace_id, thread_id, author_id, body) values (${ws}, ${id}, ${ownerId}, 'carry me')`;
      return id;
    })();
    // A resolved thread that must be left behind.
    await owner`
      insert into public.comment_threads (workspace_id, revision_id, block_id, anchor_type, status, created_by, resolved_by, resolved_at)
      values (${ws}, ${rev1}, ${blk1}, 'block', 'resolved', ${ownerId}, ${ownerId}, now())
    `;

    // The forked revision + its remapped block.
    const rev2 = (
      await owner`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
        values (${ws}, ${documentId}, 101, 'draft', ${ownerId}) returning id
      `
    )[0]!.id as string;
    const blk2 = (
      await owner`
        insert into public.blocks (workspace_id, document_id, revision_id, type, display_order, source, content, created_by)
        values (${ws}, ${documentId}, ${rev2}, 'paragraph', 1, 'manual', ${owner.json(paragraph)}, ${ownerId})
        returning id
      `
    )[0]!.id as string;

    // Carry-forward, as createDocumentRevision does it: open threads only,
    // block remapped, inherited marker pointing at the source thread.
    await owner`
      insert into public.comment_threads
        (workspace_id, revision_id, block_id, anchor_type, text_anchor, created_by, inherited_from_thread_id)
      select workspace_id, ${rev2}, ${blk2}, anchor_type, text_anchor, created_by, id
        from public.comment_threads where revision_id = ${rev1} and status = 'open'
    `;

    const carried = await admin`
      select id, block_id, inherited_from_thread_id from public.comment_threads where revision_id = ${rev2}
    `;
    expect(carried).toHaveLength(1); // only the open thread
    expect(carried[0]!.block_id).toBe(blk2); // remapped onto the new block
    expect(carried[0]!.inherited_from_thread_id).toBe(tOpen); // flagged inherited

    // FK is ON DELETE SET NULL: pruning the source revision leaves the inherited
    // thread intact, just unlinked.
    await owner`delete from public.comment_threads where id = ${tOpen}`;
    expect(
      (await admin`select inherited_from_thread_id from public.comment_threads where revision_id = ${rev2}`)[0]!
        .inherited_from_thread_id,
    ).toBeNull();
  });
});
