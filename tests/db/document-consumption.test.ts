import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * A.5 — the `document_consumption` aggregate (0024) over analytics_events (0011).
 * Locks the metrics the per-document panel shows and the RLS that scopes them:
 *   • views = all document_viewed; unique visitors = distinct session_id;
 *     downloads = all document_downloaded; identified viewers = distinct
 *     magic_link_id (gated recipients);
 *   • SECURITY INVOKER — a member of the doc's workspace sees the counts; a
 *     stranger in another tenant sees zeros (the events are RLS-hidden).
 */

let admin: Sql;
let owner: Sql;
let stranger: Sql;
let ownerId: string;
let ws: string;
let documentId: string;

const consume = async (client: Sql) => {
  const row = (await client`select * from public.document_consumption(${documentId})`)[0]!;
  return {
    views: Number(row.views),
    uniqueVisitors: Number(row.unique_visitors),
    downloads: Number(row.downloads),
    identifiedViewers: Number(row.identified_viewers),
  };
};

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `dc-owner-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `dc-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Consume', ${uniqueSlug('con')}) as id`)[0]!
    .id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('conx')})`;

  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Widget', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  documentId = (
    await owner`
      insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
      values (${ws}, ${productId}, ${docTypeId}, 'Guide', 'guide', ${ownerId}, ${ownerId}) returning id
    `
  )[0]!.id as string;

  const magicLinkId = (
    await admin`
      insert into public.magic_links (workspace_id, document_id, email, token_hash, type, expires_at)
      values (${ws}, ${documentId}, 'reader@example.com', ${`hash-${run}`}, 'open', now() + interval '7 days')
      returning id
    `
  )[0]!.id as string;

  // Service-role writes (analytics_events has no authenticated INSERT). A mix:
  // sessions s1 (twice), s2, and a gated view (s3 + magic link); one download.
  await admin`
    insert into public.analytics_events (workspace_id, event_type, document_id, session_id, magic_link_id)
    values
      (${ws}, 'document_viewed', ${documentId}, 's1', null),
      (${ws}, 'document_viewed', ${documentId}, 's1', null),
      (${ws}, 'document_viewed', ${documentId}, 's2', null),
      (${ws}, 'document_viewed', ${documentId}, 's3', ${magicLinkId}),
      (${ws}, 'document_downloaded', ${documentId}, 's2', null)
  `;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), stranger.end()]);
});

describe('document_consumption (A.5)', () => {
  it('aggregates views, unique visitors, downloads, and identified viewers', async () => {
    expect(await consume(owner)).toEqual({
      views: 4,
      uniqueVisitors: 3,
      downloads: 1,
      identifiedViewers: 1,
    });
  });

  it('a stranger in another tenant sees zeros (RLS scopes the aggregate)', async () => {
    expect(await consume(stranger)).toEqual({
      views: 0,
      uniqueVisitors: 0,
      downloads: 0,
      identifiedViewers: 0,
    });
  });
});
