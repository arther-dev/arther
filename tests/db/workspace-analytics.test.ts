import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { adminClient, createAuthUser, uniqueSlug, userClient } from './helpers';

/**
 * A.6 — workspace consumption analytics (0025) over analytics_events (0011):
 * cross-document consumption, top searches, and zero-result searches. Locks the
 * rankings/filters and the SECURITY-INVOKER RLS scoping (a stranger sees none).
 */

let admin: Sql;
let owner: Sql;
let stranger: Sql;
let ownerId: string;
let ws: string;
let doc1: string;
let doc2: string;

beforeAll(async () => {
  admin = adminClient();
  const run = crypto.randomUUID().slice(0, 8);
  ownerId = await createAuthUser(admin, `wa-owner-${run}@example.com`);
  const strangerId = await createAuthUser(admin, `wa-stranger-${run}@example.com`);
  owner = await userClient(ownerId);
  stranger = await userClient(strangerId);

  ws = (await owner`select public.create_workspace('Analytics Co', ${uniqueSlug('wac')}) as id`)[0]!
    .id as string;
  await stranger`select public.create_workspace('Elsewhere', ${uniqueSlug('wacx')})`;

  const productId = (
    await owner`insert into public.products (workspace_id, name, created_by) values (${ws}, 'Widget', ${ownerId}) returning id`
  )[0]!.id as string;
  const docTypeId = (
    await owner`select id from public.document_types where workspace_id is null limit 1`
  )[0]!.id as string;
  const mkDoc = async (slug: string, title: string): Promise<string> =>
    (
      await owner`
        insert into public.documents (workspace_id, product_id, document_type_id, title, slug, owner_id, created_by)
        values (${ws}, ${productId}, ${docTypeId}, ${title}, ${slug}, ${ownerId}, ${ownerId}) returning id
      `
    )[0]!.id as string;
  doc1 = await mkDoc('alpha', 'Alpha Guide');
  doc2 = await mkDoc('beta', 'Beta Guide');

  // doc1: 3 views (2 unique sessions) + 1 download; doc2: 1 view.
  await admin`
    insert into public.analytics_events (workspace_id, event_type, document_id, session_id)
    values
      (${ws}, 'document_viewed', ${doc1}, 's1'),
      (${ws}, 'document_viewed', ${doc1}, 's1'),
      (${ws}, 'document_viewed', ${doc1}, 's2'),
      (${ws}, 'document_downloaded', ${doc1}, 's2'),
      (${ws}, 'document_viewed', ${doc2}, 's3')
  `;
  // Searches: voltage x2 (with results), torque + missing (zero results).
  await admin`
    insert into public.analytics_events (workspace_id, event_type, session_id, payload)
    values
      (${ws}, 'portal_searched', 's1', ${admin.json({ query: 'voltage', results: 3 })}),
      (${ws}, 'portal_searched', 's2', ${admin.json({ query: 'voltage', results: 3 })}),
      (${ws}, 'portal_searched', 's1', ${admin.json({ query: 'torque', results: 0 })}),
      (${ws}, 'portal_searched', 's3', ${admin.json({ query: 'missing', results: 0 })})
  `;
});

afterAll(async () => {
  await Promise.all([admin.end(), owner.end(), stranger.end()]);
});

describe('workspace consumption analytics (0025)', () => {
  it('ranks documents by views with unique visitors + downloads', async () => {
    const rows = await owner`select * from public.workspace_document_consumption(${ws})`;
    expect(rows.map((r) => r.title)).toEqual(['Alpha Guide', 'Beta Guide']);
    expect(Number(rows[0]!.views)).toBe(3);
    expect(Number(rows[0]!.unique_visitors)).toBe(2);
    expect(Number(rows[0]!.downloads)).toBe(1);
    expect(Number(rows[1]!.views)).toBe(1);
  });

  it('returns top searches by volume', async () => {
    const rows = await owner`select * from public.workspace_top_searches(${ws}, 10)`;
    expect(rows.map((r) => r.query)).toEqual(['voltage', 'missing', 'torque']);
    expect(Number(rows[0]!.searches)).toBe(2);
  });

  it('returns only zero-result searches', async () => {
    const rows = await owner`select * from public.workspace_zero_result_searches(${ws}, 10)`;
    expect(rows.map((r) => r.query)).toEqual(['missing', 'torque']);
    expect(rows.every((r) => Number(r.searches) === 1)).toBe(true);
  });

  it('a stranger in another tenant sees nothing (RLS scopes the aggregates)', async () => {
    expect(await stranger`select * from public.workspace_document_consumption(${ws})`).toHaveLength(0);
    expect(await stranger`select * from public.workspace_top_searches(${ws}, 10)`).toHaveLength(0);
    expect(await stranger`select * from public.workspace_zero_result_searches(${ws}, 10)`).toHaveLength(0);
  });
});
