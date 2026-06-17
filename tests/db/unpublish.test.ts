import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * C4.6 probes — unpublish = archive. Taking a document off the public portal is
 * `archived_at` on its snapshots (rows are NEVER deleted; the no-delete trigger
 * backstops even the service role). The portal serves the latest non-archived
 * snapshot per document, so archiving removes it from public view while keeping
 * the publication history. Behaviour under test (all over migration 0008):
 *   - owner/admin archive their workspace's live snapshots (RLS UPDATE policy);
 *   - every archive/restore writes an audit row with the real actor (auth.uid());
 *   - restore un-archives the latest version only;
 *   - a viewer (read-only member) cannot archive — RLS matches no rows;
 *   - the freeze guard still rejects content changes through the same UPDATE path.
 */

let admin: Sql;
let owner: Sql;
let viewer: Sql;
let ownerId: string;
let viewerId: string;
let ws: string;
let documentId: string;
let snapV1: string;
let snapV2: string;

const blockTree = [{ type: 'paragraph', content: { alignment: 'left', nodes: [] } }];

/** The portal's serving query: the latest non-archived snapshot for a document. */
async function liveVersion(): Promise<string | null> {
  const rows = await admin`
    select version from public.published_snapshots
    where document_id = ${documentId} and archived_at is null
    order by published_at desc limit 1
  `;
  return (rows[0]?.version as string | undefined) ?? null;
}

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `unpub-owner-${run}@example.com`);
  viewerId = await createAuthUser(admin, `unpub-viewer-${run}@example.com`);
  owner = await userClient(ownerId);
  viewer = await userClient(viewerId);

  ws = (await owner`select public.create_workspace('Unpublish Co', ${uniqueSlug('unpub')}) as id`)[0]!
    .id as string;
  await owner`
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (${ws}, ${viewerId}, 'viewer', ${ownerId})
  `;

  const productId = (
    await owner`
      insert into public.products (workspace_id, name, created_by)
      values (${ws}, 'Beacon B1', ${ownerId}) returning id
    `
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;

  documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Beacon Datasheet', 'beacon', ${ownerId}, ${ownerId})
      returning id
    `
  )[0]!.id as string;

  // Publish two versions (v1.0, v2.0) via the service-role RPC — the only writer.
  for (const n of [1, 2]) {
    const rev = (
      await owner`
        insert into public.document_revisions (workspace_id, document_id, revision_number, state, created_by)
        values (${ws}, ${documentId}, ${n}, 'approved', ${ownerId}) returning id
      `
    )[0]!.id as string;
    const snapId = (
      await admin`select public.publish_document(${rev}, ${ownerId}, ${admin.json(blockTree)}, '{}'::jsonb, 'beacon') as id`
    )[0]!.id as string;
    if (n === 1) snapV1 = snapId;
    else snapV2 = snapId;
  }
});

afterAll(async () => {
  await owner?.end();
  await viewer?.end();
  await admin?.end();
});

describe('unpublish = archive (C4.6)', () => {
  it('serves the latest version on the portal before unpublishing', async () => {
    expect(await liveVersion()).toBe('2.0');
  });

  it('owner archives all live snapshots — the portal then serves nothing', async () => {
    const archived = await owner`
      update public.published_snapshots
      set archived_at = now(), archived_by = ${ownerId}
      where document_id = ${documentId} and archived_at is null
      returning id
    `;
    expect(archived).toHaveLength(2); // both v1.0 and v2.0
    expect(await liveVersion()).toBeNull();
  });

  it('records an audit row per archived snapshot, attributed to the actor', async () => {
    const rows = await admin`
      select actor_id from public.audit_log
      where action = 'snapshot.archived'
        and resource_type = 'published_snapshot'
        and resource_id in (${snapV1}, ${snapV2})
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.actor_id === ownerId)).toBe(true);
  });

  it('restore un-archives the latest version only (older versions stay archived)', async () => {
    await owner`
      update public.published_snapshots
      set archived_at = null, archived_by = null
      where id = ${snapV2}
    `;
    expect(await liveVersion()).toBe('2.0');

    const v1 = await admin`select archived_at from public.published_snapshots where id = ${snapV1}`;
    expect(v1[0]!.archived_at).not.toBeNull(); // v1.0 remains archived

    const restored = await admin`
      select count(*)::int as n from public.audit_log
      where action = 'snapshot.restored' and resource_id = ${snapV2}
    `;
    expect(restored[0]!.n).toBe(1);
  });

  it('a viewer cannot archive a snapshot — RLS matches no rows', async () => {
    const affected = await viewer`
      update public.published_snapshots
      set archived_at = now(), archived_by = ${viewerId}
      where id = ${snapV2}
      returning id
    `;
    expect(affected).toHaveLength(0); // RLS USING clause hides the row from a viewer
    expect(await liveVersion()).toBe('2.0'); // still live
  });

  it('the freeze guard still rejects content changes through the archive path', async () => {
    let message = '';
    try {
      await owner`
        update public.published_snapshots set block_tree = '[]'::jsonb where id = ${snapV2}
      `;
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/frozen/i);
  });
});
